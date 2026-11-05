package prepare

import (
	"bytes"
	"encoding/xml"
	"io"
	"regexp"

	"github.com/octane-xplat/nativescript-cli/internal/workflow"
)

var libraryNamespace = regexp.MustCompile(`^[A-Za-z_$][A-Za-z0-9_$]*(\.[A-Za-z_$][A-Za-z0-9_$]*)*$`)

// libraryManifest moves the legacy package meaning to Gradle's namespace. Edit
// only the root attribute bytes: XML re-encoding can change namespace prefixes
// used by Android tools and values in the rest of the manifest.
func libraryManifest(source []byte) ([]byte, string, error) {
	decoder := xml.NewDecoder(bytes.NewReader(source))
	depth, roots := 0, 0
	start, end := 0, 0
	namespace := ""
	for {
		before := int(decoder.InputOffset())
		token, err := decoder.Token()
		if err == io.EOF {
			break
		}
		if err != nil {
			return nil, "", workflow.ErrInvalid
		}
		switch value := token.(type) {
		case xml.StartElement:
			if depth == 0 {
				roots++
				if roots != 1 || value.Name.Space != "" || value.Name.Local != "manifest" {
					return nil, "", workflow.ErrInvalid
				}
				start, end = before, int(decoder.InputOffset())
				packages := 0
				for _, attr := range value.Attr {
					if attr.Name.Space == "" && attr.Name.Local == "package" {
						packages++
						if packages != 1 || !libraryNamespace.MatchString(attr.Value) {
							return nil, "", workflow.ErrInvalid
						}
						namespace = attr.Value
					}
				}
			}
			depth++
		case xml.EndElement:
			depth--
		case xml.CharData:
			if depth == 0 && len(bytes.TrimSpace(value)) != 0 {
				return nil, "", workflow.ErrInvalid
			}
		}
	}
	if roots != 1 || depth != 0 {
		return nil, "", workflow.ErrInvalid
	}
	if namespace == "" {
		return source, "", nil
	}
	// The decoder has validated the entire document. Scan the root start tag's
	// quoted attributes so package-looking text inside another value is retained.
	tag := source[start:end]
	i := len("<manifest")
	for i < len(tag) {
		attributeStart := i
		for i < len(tag) && xmlSpace(tag[i]) {
			i++
		}
		if i == len(tag) || tag[i] == '/' || tag[i] == '>' {
			break
		}
		nameStart := i
		for i < len(tag) && !xmlSpace(tag[i]) && tag[i] != '=' {
			i++
		}
		name := string(tag[nameStart:i])
		for i < len(tag) && (xmlSpace(tag[i]) || tag[i] == '=') {
			i++
		}
		if i >= len(tag) || tag[i] != '\'' && tag[i] != '"' {
			return nil, "", workflow.ErrInvalid
		}
		quote := tag[i]
		i++
		for i < len(tag) && tag[i] != quote {
			i++
		}
		if i == len(tag) {
			return nil, "", workflow.ErrInvalid
		}
		i++
		if name == "package" {
			output := make([]byte, 0, len(source)-(i-attributeStart))
			output = append(output, source[:start+attributeStart]...)
			output = append(output, source[start+i:]...)
			return output, namespace, nil
		}
	}
	return nil, "", workflow.ErrInvalid
}

func xmlSpace(b byte) bool {
	return b == ' ' || b == '\t' || b == '\r' || b == '\n'
}
