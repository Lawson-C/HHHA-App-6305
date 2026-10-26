import {BookIcon} from '@sanity/icons/Book'
import {defineArrayMember, defineField, defineType} from 'sanity'

import {libraryCategories, resourceTypes} from './shared/options'

export const libraryResource = defineType({
  name: 'libraryResource',
  title: 'Library item',
  type: 'document',
  icon: BookIcon,
  fields: [
    defineField({name: 'title', type: 'string', validation: (rule) => rule.required()}),
    defineField({
      name: 'description',
      type: 'text',
      rows: 2,
      validation: (rule) => rule.required().max(300),
    }),
    defineField({
      name: 'category',
      type: 'string',
      options: {list: libraryCategories, layout: 'radio'},
      validation: (rule) => rule.required(),
    }),
    defineField({
      name: 'resourceType',
      type: 'string',
      options: {list: resourceTypes, layout: 'radio'},
      validation: (rule) => rule.required(),
    }),
    defineField({
      name: 'url',
      type: 'url',
      description: 'Required for videos and links. Videos should be YouTube/Vimeo links, not uploads.',
      validation: (rule) =>
        rule.custom((url, context) => {
          const type = (context.document as {resourceType?: string} | undefined)?.resourceType
          return type === 'article' || url ? true : 'Add a link for videos and links'
        }),
    }),
    defineField({
      name: 'body',
      title: 'Article text',
      type: 'array',
      description: 'Use Heading 2 for sections and bulleted lists for steps. A heading containing "warning" shows its list with warning icons.',
      of: [
        defineArrayMember({
          type: 'block',
          styles: [
            {title: 'Normal', value: 'normal'},
            {title: 'Heading 2', value: 'h2'},
          ],
          lists: [{title: 'Bullet', value: 'bullet'}],
          marks: {decorators: [{title: 'Strong', value: 'strong'}], annotations: []},
        }),
      ],
    }),
    defineField({name: 'source', type: 'string', description: 'e.g. "Fulton County Health"'}),
    defineField({name: 'durationMinutes', title: 'Minutes to read or watch', type: 'number', validation: (rule) => rule.min(1).integer()}),
    defineField({
      name: 'featured',
      title: 'Show as "Start here"',
      type: 'boolean',
      initialValue: false,
    }),
    defineField({
      name: 'thumbnail',
      type: 'image',
      options: {hotspot: true},
      fields: [defineField({name: 'alt', title: 'Description for screen readers', type: 'string'})],
    }),
  ],
  preview: {
    select: {title: 'title', category: 'category', type: 'resourceType', media: 'thumbnail'},
    prepare: ({title, category, type, media}) => ({
      title,
      media,
      subtitle: [
        resourceTypes.find((t) => t.value === type)?.title.split(' (')[0],
        libraryCategories.find((c) => c.value === category)?.title,
      ]
        .filter(Boolean)
        .join(' · '),
    }),
  },
})
