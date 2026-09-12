package privy

import (
	"encoding/json"
	"sort"
	"strings"
)

// CanonicalJSON serialises with keys sorted at every level.
//
// This must be byte-identical to what Privy's enclave reconstructs. Go's
// encoding/json already sorts map keys, but it will not sort struct fields and
// escapes HTML characters by default — both of which would silently change the
// bytes being signed and produce a signature the enclave rejects.
func CanonicalJSON(v any) (string, error) {
	// Round-trip through any so structs become maps with sortable keys.
	var normalised any
	raw, err := marshalNoEscape(v)
	if err != nil {
		return "", err
	}
	dec := json.NewDecoder(strings.NewReader(string(raw)))
	dec.UseNumber()
	if err := dec.Decode(&normalised); err != nil {
		return "", err
	}

	var b strings.Builder
	if err := write(&b, normalised); err != nil {
		return "", err
	}
	return b.String(), nil
}

func marshalNoEscape(v any) ([]byte, error) {
	var buf strings.Builder
	enc := json.NewEncoder(&buf)
	enc.SetEscapeHTML(false)
	if err := enc.Encode(v); err != nil {
		return nil, err
	}
	return []byte(strings.TrimRight(buf.String(), "\n")), nil
}

func write(b *strings.Builder, v any) error {
	switch t := v.(type) {
	case map[string]any:
		keys := make([]string, 0, len(t))
		for k := range t {
			if t[k] == nil {
				continue // undefined-equivalent fields are omitted, not sent as null
			}
			keys = append(keys, k)
		}
		sort.Strings(keys)

		b.WriteByte('{')
		for i, k := range keys {
			if i > 0 {
				b.WriteByte(',')
			}
			kb, err := marshalNoEscape(k)
			if err != nil {
				return err
			}
			b.Write(kb)
			b.WriteByte(':')
			if err := write(b, t[k]); err != nil {
				return err
			}
		}
		b.WriteByte('}')

	case []any:
		b.WriteByte('[')
		for i, item := range t {
			if i > 0 {
				b.WriteByte(',')
			}
			if err := write(b, item); err != nil {
				return err
			}
		}
		b.WriteByte(']')

	default:
		raw, err := marshalNoEscape(t)
		if err != nil {
			return err
		}
		b.Write(raw)
	}
	return nil
}
