declare module 'linkify-it' {
  export interface LinkifyMatch {
    schema: string
    index: number
    lastIndex: number
    raw: string
    text: string
    url: string
  }

  class LinkifyIt {
    constructor(schemas?: unknown)
    match(text: string): LinkifyMatch[] | null
    test(text: string): boolean
  }

  export default LinkifyIt
}
