import { escapeHtml } from './html'

describe('escapeHtml', () => {
  it('escapes every HTML-significant character, including quotes for attributes', () => {
    expect(escapeHtml(`<img src=x onerror="alert('1')"> & co`)).toBe('&lt;img src=x onerror=&quot;alert(&#39;1&#39;)&quot;&gt; &amp; co')
  })
  it('leaves normal text (including Urdu and PKR amounts) unchanged', () => {
    expect(escapeHtml('Rs 50,000 — سلمان')).toBe('Rs 50,000 — سلمان')
  })
})
