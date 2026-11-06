package nativescript

import (
	"fmt"
	"strings"
	"unicode/utf8"
)

// Bounds for tool diagnostics surfaced through OperationError.Advice. Advice
// stays short enough for a single JSON message: never raw logs, environment
// values or stacks.
const (
	diagnosticMaxLines = 10
	diagnosticMaxBytes = 2048
)

// toolAdvice renders a failed tool's stage, exit status and bounded output
// summary. Empty output produces no advice.
func toolAdvice(stage string, exitCode int, output string) string {
	summary := diagnosticSummary(output)
	if summary == "" {
		return ""
	}
	label := stage + " failed"
	if exitCode != 0 {
		label += fmt.Sprintf(" (exit %d)", exitCode)
	}
	return label + ": " + summary
}

// diagnosticSummary selects the first failure-looking lines, or the last
// non-empty lines when none match, sanitized and bounded.
func diagnosticSummary(output string) string {
	var matched, tail []string
	for _, raw := range strings.Split(output, "\n") {
		line := sanitizeDiagnosticLine(raw)
		if line == "" {
			continue
		}
		if failureLine(line) && len(matched) < diagnosticMaxLines {
			matched = append(matched, line)
		}
		tail = append(tail, line)
		if len(tail) > diagnosticMaxLines {
			tail = tail[1:]
		}
	}
	picked := matched
	if len(picked) == 0 {
		picked = tail
	}
	return truncateDiagnostic(strings.Join(picked, "\n"))
}

// failureLine reports whether a log line names an actual failure rather than
// routine progress. Tools emit these markers for compile errors, dependency
// conflicts and terminal build results.
func failureLine(line string) bool {
	lower := strings.ToLower(line)
	if strings.Contains(lower, "0 error") {
		return false
	}
	return strings.Contains(lower, "error") || strings.Contains(lower, "fatal") ||
		strings.Contains(lower, "fail") || strings.Contains(line, "[!]")
}

// sanitizeDiagnosticLine removes ANSI styling and control characters so framed
// advice stays single-line printable text.
func sanitizeDiagnosticLine(line string) string {
	var b strings.Builder
	b.Grow(len(line))
	for i := 0; i < len(line); {
		c := line[i]
		if c == 0x1b && i+1 < len(line) && line[i+1] == '[' {
			j := i + 2
			for j < len(line) && !(line[j] >= 0x40 && line[j] <= 0x7e) {
				j++
			}
			i = j + 1
			continue
		}
		if c >= 0x20 && c != 0x7f {
			b.WriteByte(c)
		}
		i++
	}
	return strings.TrimSpace(b.String())
}

// truncateDiagnostic caps text at the byte bound without splitting UTF-8.
func truncateDiagnostic(text string) string {
	if len(text) <= diagnosticMaxBytes {
		return text
	}
	cut := diagnosticMaxBytes
	for cut > 0 && !utf8.RuneStart(text[cut]) {
		cut--
	}
	return text[:cut] + "…"
}
