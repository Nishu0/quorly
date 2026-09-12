// Package ids makes short, prefixed, URL-safe identifiers.
package ids

import (
	"crypto/rand"
	"fmt"
)

// Crockford-ish: no vowels to form words by accident, no characters that look
// alike when read aloud or copied by hand.
const alphabet = "0123456789abcdefghjkmnpqrstvwxyz"

// New returns something like "inv_7k2p9xq3mtv4bn8d".
func New(prefix string) string {
	b := make([]byte, 16)
	if _, err := rand.Read(b); err != nil {
		panic(fmt.Sprintf("crypto/rand failed: %v", err))
	}
	out := make([]byte, len(b))
	for i, v := range b {
		out[i] = alphabet[int(v)%len(alphabet)]
	}
	return prefix + "_" + string(out)
}
