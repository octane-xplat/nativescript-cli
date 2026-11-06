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

// RuntimeSatisfies accepts the minimum contract used by native packages: a
// one-to-three-part numeric version, optionally preceded by "v" and one of the
// "~", "^", ">=", ">" or "=" prefixes. "~", "^", ">=" and "=" declare the
// numeric floor (installed >= version); ">" requires a strictly newer runtime
// (installed > version). Compound ranges, wildcards, whitespace and
// prerelease/build suffixes remain rejected.
func RuntimeSatisfies(installed, declared string) bool {
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
	requirement := strings.TrimPrefix(declared, "v")
	strict := false
	for _, prefix := range []string{"~", "^", ">=", ">", "="} {
		if strings.HasPrefix(requirement, prefix) {
			strict = prefix == ">"
			requirement = strings.TrimPrefix(requirement, prefix)
			break
		}
	}
	b, ok := parse(requirement)
	if !ok {
		return false
	}
	for i := range a {
		if a[i] != b[i] {
			return a[i] > b[i]
		}
	}
	return !strict
}
