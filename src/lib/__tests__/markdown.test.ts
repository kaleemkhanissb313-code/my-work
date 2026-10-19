import { htmlToMarkdown, htmlToText, markdownToHtml } from '../markdown'

describe('markdown import/export', () => {
  it('converts common markdown to HTML', () => {
    const html = markdownToHtml('# Title\n\nSome **bold** and *italic* text with a [link](https://example.com).\n\n- one\n- two\n\n1. first\n\n```\ncode <b>\n```')
    expect(html).toContain('<h1>Title</h1>')
    expect(html).toContain('<strong>bold</strong>')
    expect(html).toContain('<em>italic</em>')
    expect(html).toContain('<a href="https://example.com">link</a>')
    expect(html).toContain('<ul><li><p>one</p></li><li><p>two</p></li></ul>')
    expect(html).toContain('<ol>')
    expect(html).toContain('<pre><code>code &lt;b&gt;</code></pre>')
  })

  it('escapes raw HTML and drops unsafe link schemes', () => {
    const html = markdownToHtml('<script>alert(1)</script> [x](javascript:alert(1))')
    expect(html).not.toContain('<script>')
    expect(html).not.toContain('href="javascript')
  })

  it('round-trips HTML → Markdown → text', () => {
    const html = '<h2>Plan</h2><p>Do <strong>this</strong> then <em>that</em>.</p><ul><li><p>a</p></li><li><p>b</p></li></ul>'
    const md = htmlToMarkdown(html)
    expect(md).toContain('## Plan')
    expect(md).toContain('**this**')
    expect(md).toContain('- a\n- b')
    expect(htmlToText(html)).toContain('Do this then that.')
  })
})
