import {BellIcon} from '@sanity/icons/Bell'
import {defineArrayMember, defineField, defineType} from 'sanity'

import {alertCategories} from './shared/options'

export const alert = defineType({
  name: 'alert',
  title: 'Alert',
  type: 'document',
  icon: BellIcon,
  description:
    'Publishing an alert sends a push notification to residents who opted in to its category. Emergency alerts go to everyone.',
  fields: [
    defineField({
      name: 'title',
      type: 'string',
      description: 'Shown as the push notification title. Keep it short.',
      validation: (rule) => rule.required().max(65),
    }),
    defineField({
      name: 'message',
      type: 'text',
      rows: 3,
      description: 'One or two sentences. Shown in the push notification and the alert list.',
      validation: (rule) => rule.required().max(240),
    }),
    defineField({
      name: 'category',
      type: 'string',
      options: {list: alertCategories, layout: 'radio'},
      validation: (rule) => rule.required(),
    }),
    defineField({
      name: 'issuer',
      type: 'string',
      description: 'Who issued it, e.g. "City of Atlanta Watershed Management".',
    }),
    defineField({name: 'body', title: 'Details', type: 'text', rows: 5}),
    defineField({
      name: 'actionSteps',
      title: 'What to do now',
      type: 'array',
      of: [defineArrayMember({type: 'string'})],
      validation: (rule) => rule.max(8),
    }),
    defineField({
      name: 'affectedArea',
      type: 'text',
      rows: 2,
      description: 'Plain-language description, e.g. "English Avenue and Vine City north of MLK Jr. Dr."',
    }),
    defineField({
      name: 'sentAt',
      title: 'Issued at',
      type: 'datetime',
      initialValue: () => new Date().toISOString(),
      validation: (rule) => rule.required(),
    }),
    defineField({
      name: 'endsAt',
      title: 'Ends at',
      type: 'datetime',
      description: 'Optional. After this time the alert shows as ended.',
      validation: (rule) =>
        rule.custom((endsAt, context) => {
          const sentAt = (context.document as {sentAt?: string} | undefined)?.sentAt
          if (endsAt && sentAt && new Date(endsAt) <= new Date(sentAt)) {
            return 'Must be after the issue time'
          }
          return true
        }),
    }),
  ],
  orderings: [{title: 'Newest first', name: 'sentAtDesc', by: [{field: 'sentAt', direction: 'desc'}]}],
  preview: {
    select: {title: 'title', category: 'category', issuer: 'issuer'},
    prepare: ({title, category, issuer}) => ({
      title,
      subtitle: [alertCategories.find((c) => c.value === category)?.title, issuer]
        .filter(Boolean)
        .join(' · '),
    }),
  },
})
