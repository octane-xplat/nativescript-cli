//go:build darwin || linux

package process

import (
	"errors"
	"reflect"
	"syscall"
	"testing"
)

func TestGroupRetirementRequiresObservedAbsence(t *testing.T) {
	for _, test := range []struct {
		name       string
		term, kill error
		probes     []error
		want       []syscall.Signal
	}{
		{"already absent", syscall.ESRCH, nil, nil, []syscall.Signal{syscall.SIGTERM}},
		{"absent during escalation", nil, syscall.ESRCH, nil, []syscall.Signal{syscall.SIGTERM, syscall.SIGKILL}},
		{"TERM error then absent", syscall.EPERM, nil, []error{syscall.ESRCH}, []syscall.Signal{syscall.SIGTERM, syscall.SIGKILL, 0}},
		{"KILL error then absent", nil, syscall.EPERM, []error{syscall.ESRCH}, []syscall.Signal{syscall.SIGTERM, syscall.SIGKILL, 0}},
		{"transient probe error then absent", nil, nil, []error{syscall.EPERM, syscall.ESRCH}, []syscall.Signal{syscall.SIGTERM, syscall.SIGKILL, 0, 0}},
	} {
		t.Run(test.name, func(t *testing.T) {
			var calls []syscall.Signal
			probe := 0
			err := stopGroup(4242, func(group int, signal syscall.Signal) error {
				if group != -4242 {
					t.Fatalf("signal escaped the owned group: %d", group)
				}
				calls = append(calls, signal)
				switch signal {
				case syscall.SIGTERM:
					return test.term
				case syscall.SIGKILL:
					return test.kill
				case 0:
					if probe >= len(test.probes) {
						t.Fatal("unexpected retirement probe")
					}
					result := test.probes[probe]
					probe++
					return result
				default:
					t.Fatalf("unexpected signal: %d", signal)
					return nil
				}
			})
			if err != nil || !reflect.DeepEqual(calls, test.want) {
				t.Fatalf("retirement: error=%v calls=%v want=%v", err, calls, test.want)
			}
		})
	}
}

func TestUnverifiedGroupRetirementRetainsFailure(t *testing.T) {
	for _, denied := range []bool{false, true} {
		t.Run(map[bool]string{false: "still present", true: "permission denied"}[denied], func(t *testing.T) {
			err := stopGroup(4242, func(group int, signal syscall.Signal) error {
				if group != -4242 {
					t.Fatalf("signal escaped the owned group: %d", group)
				}
				if denied {
					return syscall.EPERM
				}
				return nil
			})
			if err == nil || (denied && !errors.Is(err, syscall.EPERM)) {
				t.Fatalf("unverified cleanup was accepted: %v", err)
			}
		})
	}
}
