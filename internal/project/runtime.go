package project

import (
	"strconv"
	"strings"
)

// RuntimeSupported is the exact preparation matrix, not a major-version promise.
func RuntimeSupported(platform, version string) bool {
	switch platform {
	case "ios":
		return version == "8.9.0" || version == "9.1.0"
	case "android":
		return version == "9.0.0" || version == "9.1.1"
	}
	return false
}

// RuntimeSatisfies accepts the numeric minimum contract used by native packages.
func RuntimeSatisfies(installed, minimum string) bool {
	parse := func(s string) ([3]int, bool) {
		var v [3]int
		parts := strings.Split(s, ".")
		if len(parts) > 3 {
			return v, false
		}
		for i, p := range parts {
			if p == "" || strings.Trim(p, "0123456789") != "" {
				return v, false
			}
			n, err := strconv.Atoi(p)
			if err != nil {
				return v, false
			}
			v[i] = n
		}
		return v, true
	}
	a, ok := parse(installed)
	if !ok {
		return false
	}
	b, ok := parse(minimum)
	if !ok {
		return false
	}
	for i := range a {
		if a[i] != b[i] {
			return a[i] > b[i]
		}
	}
	return true
}
