import {CalendarIcon} from '@sanity/icons/Calendar'
import {defineField, defineType} from 'sanity'

import {eventTypes, neighborhoods} from './shared/options'

export const event = defineType({
  name: 'event',
  title: 'Event',
  type: 'document',
  icon: CalendarIcon,
  fields: [
    defineField({name: 'title', type: 'string', validation: (rule) => rule.required().max(120)}),
    defineField({
      name: 'eventType',
      type: 'string',
      options: {list: eventTypes, layout: 'radio'},
      validation: (rule) => rule.required(),
    }),
    defineField({name: 'startsAt', type: 'datetime', validation: (rule) => rule.required()}),
    defineField({
      name: 'endsAt',
      type: 'datetime',
      validation: (rule) =>
        rule.required().custom((endsAt, context) => {
          const startsAt = (context.document as {startsAt?: string} | undefined)?.startsAt
          if (endsAt && startsAt && new Date(endsAt) <= new Date(startsAt)) {
            return 'Must be after the start time'
          }
          return true
        }),
    }),
    defineField({name: 'description', type: 'text', rows: 4, validation: (rule) => rule.required()}),
    defineField({
      name: 'locationName',
      title: 'Place',
      type: 'string',
      description: 'e.g. "Hunter Hills Community Center"',
    }),
    defineField({name: 'address', type: 'string', description: 'Used for "Get directions".'}),
    defineField({
      name: 'neighborhood',
      type: 'string',
      options: {list: neighborhoods},
    }),
    defineField({name: 'costLabel', title: 'Cost', type: 'string', description: 'e.g. "Free"'}),
    defineField({
      name: 'costNote',
      type: 'string',
      description: 'e.g. "Dinner and childcare provided"',
    }),
  ],
  orderings: [{title: 'Date', name: 'startsAtAsc', by: [{field: 'startsAt', direction: 'asc'}]}],
  preview: {
    select: {title: 'title', startsAt: 'startsAt', place: 'locationName'},
    prepare: ({title, startsAt, place}) => ({
      title,
      subtitle: [
        startsAt
          ? new Date(startsAt).toLocaleString('en-US', {
              dateStyle: 'medium',
              timeStyle: 'short',
              timeZone: 'America/New_York',
            })
          : null,
        place,
      ]
        .filter(Boolean)
        .join(' · '),
    }),
  },
})
