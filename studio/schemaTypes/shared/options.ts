/**
 * Enum values shared with the app (src/lib/api/types.ts) and Supabase. Values must match
 * docs/data-model.md exactly; titles are what staff see in the Studio.
 */
export const neighborhoods = [
  {title: 'English Avenue', value: 'english_avenue'},
  {title: 'Vine City', value: 'vine_city'},
  {title: 'Hunter Hills', value: 'hunter_hills'},
  {title: 'Washington Park', value: 'washington_park'},
  {title: 'Historic Westin Heights / Bankhead', value: 'bankhead'},
  {title: 'Knight Park / Howell Station', value: 'knight_park'},
  {title: 'Dixie Hills', value: 'dixie_hills'},
  {title: 'West Lake', value: 'west_lake'},
  {title: 'Center Hill', value: 'center_hill'},
  {title: 'Harvel Homes Community', value: 'harvel_homes'},
  {title: 'Georgia Tech', value: 'georgia_tech'},
]

export const alertCategories = [
  {title: 'Emergency (goes to everyone)', value: 'emergency'},
  {title: 'Health warning', value: 'health_warning'},
  {title: 'Community announcement', value: 'community_announcement'},
  {title: 'Meeting reminder', value: 'meeting_reminder'},
]

export const eventTypes = [
  {title: 'Workforce development', value: 'workforce_development'},
  {title: 'Financial literacy', value: 'financial_literacy'},
  {title: 'Wellness', value: 'wellness'},
  {title: 'Civic meeting', value: 'civic_meeting'},
  {title: 'Community gathering', value: 'community_gathering'},
  {title: 'Other', value: 'other'},
]

export const housingCategories = [
  {title: 'Rental assistance', value: 'rental_assistance'},
  {title: 'Eviction prevention', value: 'eviction_prevention'},
  {title: 'Affordable housing', value: 'affordable_housing'},
  {title: 'Homeownership', value: 'homeownership'},
  {title: 'Home repair', value: 'home_repair'},
]

export const libraryCategories = [
  {title: 'Money', value: 'financial_tools'},
  {title: 'Health', value: 'health'},
  {title: 'Education', value: 'education'},
  {title: 'Small business', value: 'small_business'},
]

export const resourceTypes = [
  {title: 'Article (written in the app)', value: 'article'},
  {title: 'Video (link to YouTube/Vimeo)', value: 'video'},
  {title: 'Link (website)', value: 'link'},
]

/** E.164 phone, e.g. +14045550142 (the app formats it for display). */
export const PHONE_RE = /^\+[1-9]\d{1,14}$/
