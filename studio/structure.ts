import {TextIcon} from '@sanity/icons/Text'
import type {StructureResolver} from 'sanity/structure'

/** Sidebar for Foundation staff: the things they edit most first, app text last. */
export const structure: StructureResolver = (S) =>
  S.list()
    .title('Hunter Hills')
    .items([
      S.documentTypeListItem('alert').title('Alerts'),
      S.documentTypeListItem('event').title('Events'),
      S.divider(),
      S.documentTypeListItem('housingProgram').title('Housing programs'),
      S.documentTypeListItem('housingListing').title('Housing listings'),
      S.documentTypeListItem('libraryResource').title('Library'),
      S.divider(),
      S.listItem()
        .title('App text')
        .icon(TextIcon)
        .child(S.document().schemaType('appCopy').documentId('appCopy').title('App text')),
    ])
