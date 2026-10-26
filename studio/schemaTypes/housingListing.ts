import {PinIcon} from '@sanity/icons/Pin'
import {defineField, defineType} from 'sanity'

import {neighborhoods} from './shared/options'

export const housingListing = defineType({
  name: 'housingListing',
  title: 'Housing listing',
  type: 'document',
  icon: PinIcon,
  description: 'An open affordable-housing unit, shown under "Open listings".',
  fields: [
    defineField({name: 'title', type: 'string', description: 'e.g. "2-bedroom apartment"', validation: (rule) => rule.required()}),
    defineField({name: 'address', type: 'string', validation: (rule) => rule.required()}),
    defineField({name: 'neighborhood', type: 'string', options: {list: neighborhoods}}),
    defineField({name: 'rentLabel', title: 'Rent', type: 'string', description: 'e.g. "$950/mo"'}),
    defineField({name: 'bedrooms', type: 'number', validation: (rule) => rule.min(0).integer()}),
    defineField({
      name: 'image',
      type: 'image',
      options: {hotspot: true},
      fields: [defineField({name: 'alt', title: 'Description for screen readers', type: 'string'})],
    }),
    defineField({name: 'url', title: 'Where to apply', type: 'url'}),
    defineField({name: 'availableFrom', type: 'date'}),
  ],
  preview: {
    select: {title: 'title', subtitle: 'address', media: 'image'},
  },
})
