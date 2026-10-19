/** Symbol & character sets for the Symbols tool and the text tools. */
export const CHARACTER_SETS: { id: string; name: string; chars: string[]; rtl?: boolean; note?: string }[] = [
  { id: 'upper', name: 'Uppercase A–Z', chars: 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('') },
  { id: 'lower', name: 'Lowercase a–z', chars: 'abcdefghijklmnopqrstuvwxyz'.split('') },
  { id: 'digits', name: 'Numbers 0–9', chars: '0123456789'.split('') },
  { id: 'alnum', name: 'Letters & numbers (A–Z, a–z, 0–9)', chars: 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'.split('') },
  { id: 'punct', name: 'Punctuation & special characters', chars: '! " # $ % & \' ( ) * + , - . / : ; < = > ? @ [ \\ ] ^ _ ` { | } ~ ¡ ¿ … – — « » ‹ › “ ” ‘ ’ • · ¶ § † ‡'.split(' ') },
  { id: 'currency', name: 'Currency', chars: 'Rs ₨ ₹ $ € £ ¥ ₩ ₽ ₺ ₪ ₫ ฿ ₦ ₱ ₡ ¢ ₿ ﷼ د.إ'.split(' '), note: 'Pakistan: “Rs” is the common written form; ₨ is the Unicode rupee sign.' },
  { id: 'math', name: 'Math', chars: '+ − × ÷ = ≠ ≈ ≡ < > ≤ ≥ ± ∓ ∑ ∏ √ ∛ ∞ ∫ ∂ ∆ ∇ ∈ ∉ ∩ ∪ ⊂ ⊃ ⊆ ⊇ ∧ ∨ ¬ ∀ ∃ ∅ ° ′ ″ ‰ ‱ π µ'.split(' ') },
  { id: 'fractions', name: 'Fractions, super- & subscripts', chars: '½ ⅓ ⅔ ¼ ¾ ⅕ ⅖ ⅗ ⅘ ⅙ ⅚ ⅛ ⅜ ⅝ ⅞ ⁰ ¹ ² ³ ⁴ ⁵ ⁶ ⁷ ⁸ ⁹ ⁺ ⁻ ⁿ ₀ ₁ ₂ ₃ ₄ ₅ ₆ ₇ ₈ ₉'.split(' ') },
  { id: 'arrows', name: 'Arrows', chars: '← → ↑ ↓ ↔ ↕ ⇐ ⇒ ⇑ ⇓ ⇔ ↖ ↗ ↘ ↙ ⟵ ⟶ ➜ ➔ ➤ ▲ ▼ ◀ ▶ ⬆ ⬇ ⬅ ➡ ↺ ↻'.split(' ') },
  { id: 'status', name: 'Status & business', chars: '✓ ✔ ✗ ✘ ☐ ☑ ☒ ★ ☆ ● ○ ◆ ◇ ■ □ ▪ ▫ ⚠ ⛔ ✅ ❌ ❗ ❓ ℹ ⓘ © ® ™ № ℅ ✉ ☎ ⌚ ⌛ ✂ ✎ ✏ 📌 📎'.split(' ') },
  { id: 'greek', name: 'Greek', chars: 'α β γ δ ε ζ η θ ι κ λ μ ν ξ ο π ρ σ τ υ φ χ ψ ω Α Β Γ Δ Ε Ζ Η Θ Ι Κ Λ Μ Ν Ξ Ο Π Ρ Σ Τ Υ Φ Χ Ψ Ω'.split(' ') },
  { id: 'urdu', name: 'Urdu letters', chars: 'ا ب پ ت ٹ ث ج چ ح خ د ڈ ذ ر ڑ ز ژ س ش ص ض ط ظ ع غ ف ق ک گ ل م ن ں و ہ ھ ء ی ے'.split(' '), rtl: true },
  { id: 'urdu-digits', name: 'Urdu / Eastern Arabic digits', chars: '۰ ۱ ۲ ۳ ۴ ۵ ۶ ۷ ۸ ۹ ٠ ١ ٢ ٣ ٤ ٥ ٦ ٧ ٨ ٩ ، ؛ ؟ ٪'.split(' '), rtl: true },
]

/** Unicode code point label, e.g. "U+20A8". */
export const codePoint = (ch: string) => [...ch].map((c) => `U+${c.codePointAt(0)!.toString(16).toUpperCase().padStart(4, '0')}`).join(' ')
/** HTML entity form, e.g. "&#8360;". */
export const htmlEntity = (ch: string) => [...ch].map((c) => `&#${c.codePointAt(0)};`).join('')

/** Convert Western digits to Urdu (Extended Arabic-Indic) digits and back. */
export const toUrduDigits = (s: string) => s.replace(/[0-9]/g, (d) => '۰۱۲۳۴۵۶۷۸۹'[Number(d)])
export const fromUrduDigits = (s: string) => s.replace(/[۰-۹]/g, (d) => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(d))).replace(/[٠-٩]/g, (d) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(d)))
