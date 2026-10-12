'use strict';

/**
 * Demo content for `npm run seed`. Copy comes from the Figma prototype and mirrors the app's
 * demo data (src/lib/api/mock-data.ts) so demo and seeded builds look the same.
 * Phone numbers are fictional 404-555-01xx numbers. Replace real contacts through the CMS.
 */

/** A wall-clock time in America/New_York → ISO (UTC). monthOffset 1 = next month. */
function et(day, hour, minute = 0, monthOffset = 0, now = new Date()) {
  const year = now.getFullYear();
  const month = now.getMonth() + monthOffset;
  for (const offset of [4, 5]) {
    const candidate = new Date(Date.UTC(year, month, day, hour + offset, minute));
    const shown = new Intl.DateTimeFormat('en-US', {
      timeZone: 'America/New_York',
      hour: 'numeric',
      hourCycle: 'h23',
    }).format(candidate);
    if (Number(shown) === hour) return candidate.toISOString();
  }
  return new Date(Date.UTC(year, month, day, hour + 5, minute)).toISOString();
}

const minutesAgo = (m, now = new Date()) => new Date(now.getTime() - m * 60000).toISOString();
const daysAgo = (d, now) => minutesAgo(d * 24 * 60, now);

const DEMO_PROFILE = {
  // Not a real Supabase user: it only owns the demo blight reports.
  supabaseUserId: '00000000-0000-4000-8000-00000000d001',
  fullName: 'Denise Carter',
  email: 'denise.carter@email.com',
  phone: '+14045550142',
  role: 'resident',
  status: 'active',
  neighborhood: 'english_avenue',
  textSize: 'default',
  language: 'en',
  notificationPreferences: {
    healthWarnings: true,
    communityAnnouncements: true,
    meetingReminders: false,
  },
};

const alerts = (now) => [
  {
    title: 'Boil water advisory',
    message: 'Boil tap water before drinking, cooking or brushing teeth.',
    category: 'emergency',
    issuer: 'City of Atlanta Watershed Management',
    body: 'A water main break on Joseph E. Boone Blvd lowered pressure in parts of District 3. Until testing confirms the water is safe, follow the steps below.',
    actionSteps: [
      'Boil tap water for at least 1 minute before drinking, cooking or brushing teeth.',
      'Use bottled or boiled water for baby formula.',
      'Throw away ice made today.',
    ],
    affectedArea: 'English Avenue, Vine City and parts of Hunter Hills north of MLK Jr. Dr.',
    sentAt: minutesAgo(10, now),
    endsAt: null,
  },
  {
    title: 'Mosquito spraying tonight',
    message: '9 PM · Fulton County Health',
    category: 'health_warning',
    issuer: 'Fulton County Health',
    body: 'Trucks will spray for mosquitoes between 9 PM and midnight. Keep windows closed and bring pets inside while trucks pass.',
    actionSteps: ['Keep windows closed from 9 PM to midnight.', 'Bring pets and pet bowls inside.'],
    affectedArea: 'All of Council District 3',
    sentAt: minutesAgo(45, now),
    endsAt: null,
  },
  {
    title: 'Bulk trash pickup moves to Saturday',
    message: 'Public Works',
    category: 'community_announcement',
    issuer: 'Public Works',
    body: 'Bulk trash pickup for this week moves from Friday to Saturday because of the holiday.',
    actionSteps: ['Put bulk items at the curb by 7 AM Saturday.'],
    affectedArea: null,
    sentAt: minutesAgo(180, now),
    endsAt: null,
  },
  {
    title: 'NPU-L agenda posted for Oct 1',
    message: 'Neighborhood Planning Unit',
    category: 'meeting_reminder',
    issuer: 'Neighborhood Planning Unit L',
    body: 'The agenda for the next NPU-L meeting is posted. Residents can comment on zoning items in person or online.',
    actionSteps: [],
    affectedArea: null,
    sentAt: daysAgo(3, now),
    endsAt: null,
  },
  {
    title: 'Tree planting volunteers needed',
    message: 'Trees Atlanta',
    category: 'community_announcement',
    issuer: 'Trees Atlanta',
    body: 'Help plant 40 trees along Lindsay St. Gloves, tools and lunch are provided.',
    actionSteps: [],
    affectedArea: null,
    sentAt: daysAgo(4, now),
    endsAt: null,
  },
  {
    title: 'Heat advisory has ended',
    message: 'National Weather Service',
    category: 'health_warning',
    issuer: 'National Weather Service',
    body: 'The heat advisory for Fulton County has ended.',
    actionSteps: [],
    affectedArea: null,
    sentAt: daysAgo(5, now),
    endsAt: daysAgo(5, now),
  },
];

const HHCC = {
  locationName: 'Hunter Hills Community Center',
  address: '1100 Joseph E. Lowery Blvd NW, Atlanta, GA',
  neighborhood: 'Hunter Hills',
};
const EAC = {
  locationName: 'EAC Opportunity Hub',
  address: '717 Lowery Blvd NW, Atlanta, GA',
  neighborhood: 'English Avenue',
};

const events = (now) => [
  {
    title: 'Budgeting basics workshop',
    description:
      "Learn a simple way to plan your monthly budget, cut down on fees, and build savings. Bring a recent bill or pay stub if you'd like one-on-one help.",
    startsAt: et(24, 18, 0, 0, now),
    endsAt: et(24, 19, 30, 0, now),
    eventType: 'financial_literacy',
    ...HHCC,
    costLabel: 'Free',
    costNote: 'Dinner and childcare provided',
  },
  {
    title: 'Senior wellness walk',
    description: 'An easy one-mile walk around Washington Park with a health check at the end.',
    startsAt: et(24, 9, 0, 0, now),
    endsAt: et(24, 10, 0, 0, now),
    eventType: 'wellness',
    locationName: 'Washington Park',
    address: '1125 Lena St NW, Atlanta, GA',
    neighborhood: 'Washington Park',
    costLabel: 'Free',
  },
  {
    title: 'Westside job fair',
    description: 'Meet 30+ local employers hiring now. Bring copies of your resume.',
    startsAt: et(3, 10, 0, 0, now),
    endsAt: et(3, 14, 0, 0, now),
    eventType: 'workforce_development',
    ...EAC,
    costLabel: 'Free',
  },
  {
    title: 'Resume help night',
    description: 'Volunteers help you write or update your resume.',
    startsAt: et(12, 17, 30, 0, now),
    endsAt: et(12, 19, 0, 0, now),
    eventType: 'workforce_development',
    ...EAC,
    costLabel: 'Free',
  },
  {
    title: 'Proctor Creek cleanup',
    description: 'Help clear trash from the creek banks. Gloves and bags provided.',
    startsAt: et(8, 9, 0, 0, now),
    endsAt: et(8, 12, 0, 0, now),
    eventType: 'community_gathering',
    locationName: 'Lindsay St Park',
    address: '505 Lindsay St NW, Atlanta, GA',
    neighborhood: 'English Avenue',
    costLabel: 'Free',
  },
  {
    title: 'Yoga in the park',
    description: 'All levels welcome. Bring a mat or towel.',
    startsAt: et(15, 8, 0, 0, now),
    endsAt: et(15, 9, 0, 0, now),
    eventType: 'wellness',
    locationName: 'Mattie Freeland Park',
    address: '835 Mayson Turner Rd NW, Atlanta, GA',
    neighborhood: 'Vine City',
    costLabel: 'Free',
  },
  {
    title: 'NPU-L monthly meeting',
    description: 'Neighborhood Planning Unit L meets to discuss zoning, safety and city updates.',
    startsAt: et(19, 18, 30, 0, now),
    endsAt: et(19, 20, 0, 0, now),
    eventType: 'civic_meeting',
    locationName: 'Lindsay Street Baptist Church',
    address: '550 Lindsay St NW, Atlanta, GA',
    neighborhood: 'English Avenue',
    costLabel: 'Free',
  },
  {
    title: 'Westside fall festival',
    description: 'Music, food trucks and a kids zone.',
    startsAt: et(19, 12, 0, 0, now),
    endsAt: et(19, 17, 0, 0, now),
    eventType: 'community_gathering',
    locationName: 'Kathryn Johnston Memorial Park',
    address: '510 Joseph E. Boone Blvd NW, Atlanta, GA',
    neighborhood: 'English Avenue',
    costLabel: 'Free',
  },
  {
    title: 'Understanding your credit score',
    description: 'A free class on reading your credit report and raising your score.',
    startsAt: et(26, 18, 0, 0, now),
    endsAt: et(26, 19, 30, 0, now),
    eventType: 'financial_literacy',
    ...HHCC,
    costLabel: 'Free',
  },
  {
    title: 'District 3 town hall',
    description: 'Hear from your city council member and ask questions.',
    startsAt: et(29, 18, 0, 0, now),
    endsAt: et(29, 19, 30, 0, now),
    eventType: 'civic_meeting',
    locationName: 'Vine City Community Center',
    address: '480 Joseph E. Lowery Blvd NW, Atlanta, GA',
    neighborhood: 'Vine City',
    costLabel: 'Free',
  },
  {
    title: 'First-time homebuyer class',
    description: 'Learn about down payment help and how to get pre-approved.',
    startsAt: et(6, 10, 0, 1, now),
    endsAt: et(6, 12, 0, 1, now),
    eventType: 'financial_literacy',
    ...HHCC,
    costLabel: 'Free',
  },
  {
    title: 'Community potluck',
    description: 'Bring a dish to share and meet your neighbors.',
    startsAt: et(14, 13, 0, 1, now),
    endsAt: et(14, 16, 0, 1, now),
    eventType: 'other',
    ...HHCC,
    costLabel: 'Free',
    costNote: 'Bring a dish if you can',
  },
];

const housingResources = [
  {
    title: 'Emergency rental assistance',
    category: 'rental_assistance',
    summary: 'Help paying past-due rent and utilities so you can stay in your home.',
    highlights: [
      { value: 'Up to 3', label: 'months of rent' },
      { value: 'Free', label: 'to apply' },
      { value: '~10', label: 'days to decide' },
    ],
    eligibility: [
      'You live in Fulton County',
      'Your household earns under 80% of area median income',
      "You're behind on rent or received a notice",
    ],
    requiredMaterials: ['Photo ID', 'Your lease', 'Proof of income', 'Past-due notice or ledger'],
    contactName: 'Fulton County Housing Help Line',
    contactPhone: '+14045550101',
    website: 'https://www.fultoncountyga.gov',
    acceptsInquiries: true,
    inquiryAllowsAttachments: true,
  },
  {
    title: 'Free eviction legal help',
    category: 'eviction_prevention',
    summary: 'Talk to a lawyer for free if you received an eviction notice or court papers.',
    highlights: [
      { value: 'Free', label: 'legal advice' },
      { value: 'Same day', label: 'callback' },
    ],
    eligibility: ['You rent your home in Atlanta', "You've received a notice or court papers"],
    requiredMaterials: ['Any notices or court papers', 'Your lease if you have one'],
    contactName: 'Atlanta Legal Aid',
    contactPhone: '+14045550102',
    website: 'https://atlantalegalaid.org',
    acceptsInquiries: true,
    inquiryAllowsAttachments: true,
  },
  {
    title: 'Affordable housing waitlists',
    category: 'affordable_housing',
    summary: 'Get on waitlists for income-restricted apartments on the Westside.',
    highlights: [{ value: 'Free', label: 'to join' }],
    eligibility: ['Household income limits apply'],
    requiredMaterials: ['Photo ID', 'Proof of income'],
    contactName: 'Atlanta Housing',
    contactPhone: '+14045550103',
    website: 'https://www.atlantahousing.org',
    acceptsInquiries: true,
    inquiryAllowsAttachments: false,
  },
  {
    title: 'Down payment assistance',
    category: 'homeownership',
    summary: 'Grants and low-interest loans to help first-time buyers buy a home in the city.',
    highlights: [
      { value: 'Up to $20k', label: 'toward down payment' },
      { value: '8 hrs', label: 'homebuyer class' },
    ],
    eligibility: ['First-time homebuyer', 'Income under 120% of area median income'],
    requiredMaterials: ['Pre-approval letter', 'Homebuyer class certificate'],
    contactName: 'Invest Atlanta',
    contactPhone: '+14045550104',
    website: 'https://www.investatlanta.com',
    acceptsInquiries: true,
    inquiryAllowsAttachments: true,
  },
  {
    title: 'Senior home repair program',
    category: 'home_repair',
    summary: 'Free critical repairs (roofs, heating, accessibility) for older homeowners.',
    highlights: [{ value: 'Free', label: 'for eligible seniors' }],
    eligibility: ['Homeowner age 62 or older', 'You live in the home'],
    requiredMaterials: ['Photo ID', 'Proof you own the home'],
    acceptsInquiries: true,
    inquiryAllowsAttachments: true,
  },
];

const housingListings = [
  {
    title: '2-bedroom apartment',
    address: '640 Lindsay St NW',
    neighborhood: 'english_avenue',
    rentLabel: '$950/mo',
    bedrooms: 2,
  },
  {
    title: '3-bedroom house',
    address: '214 Sunset Ave NW',
    neighborhood: 'vine_city',
    rentLabel: '$1,240/mo',
    bedrooms: 3,
  },
  {
    title: '1-bedroom senior apartment',
    address: '455 Joseph E. Lowery Blvd NW',
    neighborhood: 'hunter_hills',
    rentLabel: '$780/mo',
    bedrooms: 1,
  },
];

const libraryResources = [
  {
    title: 'Your guide to the Hunter Hills app',
    description: 'A three-minute tour of alerts, reporting, events and housing help.',
    category: 'education',
    resourceType: 'video',
    url: 'https://www.historichunterhills.org',
    source: 'Historic Hunter Hills',
    durationMinutes: 3,
    featured: true,
  },
  {
    title: 'Keeping cool in extreme heat',
    description: 'How to stay safe at home when the heat index climbs.',
    category: 'health',
    resourceType: 'video',
    url: 'https://www.ready.gov/heat',
    body: 'Heat is the deadliest weather in Georgia. Older adults, young children, and people with health conditions are most at risk, especially at home without air conditioning.\n\n## Warning signs\n\n- Heavy sweating, dizziness, or nausea\n- Headache or confusion\n- Fast, weak pulse\n\n## What to do\n\n- Move to a cool place and drink water.\n- Call 911 if someone is confused or stops sweating.',
    source: 'Fulton County Health',
    durationMinutes: 2,
    featured: false,
  },
  {
    title: 'Understanding your water bill',
    description: 'What each line on your City of Atlanta water bill means.',
    category: 'financial_tools',
    resourceType: 'article',
    body: 'Your water bill has three parts: water, sewer and the security surcharge.\n\n## Lower your bill\n\n- Fix leaks fast. A running toilet can waste 200 gallons a day.\n- Ask about the Care and Conserve assistance program.',
    source: 'Department of Watershed Management',
    durationMinutes: 4,
    featured: false,
  },
  {
    title: 'Free tax help near you',
    description: 'IRS VITA sites prepare taxes for free if you earn under $67,000.',
    category: 'financial_tools',
    resourceType: 'link',
    url: 'https://irs.treasury.gov/freetaxprep/',
    source: 'IRS VITA sites',
    featured: false,
  },
  {
    title: 'GED & adult education classes',
    description: 'Free classes to earn your GED, with evening and weekend options.',
    category: 'education',
    resourceType: 'link',
    url: 'https://www.atlantatech.edu',
    source: 'Atlanta Technical College',
    featured: false,
  },
  {
    title: 'Starting a small business',
    description: 'Free coaching, permits checklist and micro-loans for Westside businesses.',
    category: 'small_business',
    resourceType: 'article',
    body: 'Thinking about starting a business? Start with a plan, then register with the Georgia Secretary of State.\n\n## Free help\n\n- Small business coaching at the EAC Opportunity Hub\n- Micro-loans through Invest Atlanta',
    source: 'Invest Atlanta',
    durationMinutes: 5,
    featured: false,
  },
];

const blightReports = (now) => [
  {
    category: 'vacant_lot',
    description: 'Overgrown lot with broken fence.',
    latitude: 33.7598,
    longitude: -84.4189,
    address: 'Vacant lot on Sunset Ave',
    status: 'reported_to_city',
    createdAt: daysAgo(9, now),
    statusHistory: [
      { status: 'submitted', at: daysAgo(9, now) },
      { status: 'under_review', at: daysAgo(8, now) },
      { status: 'reported_to_city', at: daysAgo(6, now) },
    ],
  },
  {
    category: 'standing_water',
    description: 'Pool of water in the alley for two weeks.',
    latitude: 33.7611,
    longitude: -84.4176,
    address: 'Standing water, Lindsay St',
    status: 'resolved',
    createdAt: daysAgo(20, now),
    resolvedAt: daysAgo(12, now),
    resolutionNote: 'Public Works cleared the storm drain.',
    statusHistory: [
      { status: 'submitted', at: daysAgo(20, now) },
      { status: 'under_review', at: daysAgo(19, now) },
      { status: 'reported_to_city', at: daysAgo(17, now) },
      { status: 'resolved', at: daysAgo(12, now) },
    ],
  },
  {
    category: 'illegal_dumping',
    description: 'Tires and a couch dumped behind the corner store.',
    latitude: 33.7625,
    longitude: -84.4211,
    address: 'Joseph E. Boone Blvd NW near Lindsay St',
    status: 'submitted',
    createdAt: daysAgo(2, now),
    statusHistory: [{ status: 'submitted', at: daysAgo(2, now) }],
  },
  {
    category: 'abandoned_building',
    description: 'Boarded-up house with an open back door.',
    latitude: 33.7571,
    longitude: -84.4268,
    address: 'Hunter Hills, near Mayson Turner Rd NW',
    status: 'under_review',
    createdAt: daysAgo(5, now),
    statusHistory: [
      { status: 'submitted', at: daysAgo(5, now) },
      { status: 'under_review', at: daysAgo(4, now) },
    ],
  },
];

const environmentalSources = [
  {
    key: 'airnow',
    name: 'AirNow (EPA)',
    url: 'https://www.airnow.gov',
    categories: ['air_quality'],
  },
  {
    key: 'nws',
    name: 'National Weather Service',
    url: 'https://www.weather.gov',
    categories: ['temperature', 'heat'],
  },
  {
    key: 'atlanta-watershed',
    name: 'Atlanta Watershed Mgmt.',
    url: 'https://www.atlantawatershed.org',
    categories: ['water_quality'],
  },
  {
    key: 'fulton-health',
    name: 'Fulton County Health',
    url: 'https://www.fultoncountyga.gov',
    categories: ['mosquito'],
  },
];

const hourMark = (offset, now) => {
  const d = new Date(now);
  d.setMinutes(0, 0, 0);
  d.setHours(d.getHours() + offset);
  return d.toISOString();
};

const environmentalReadings = (now, centroid) =>
  [
    {
      source: 'airnow',
      category: 'air_quality',
      value: 42,
      unit: 'AQI',
      level: 'good',
      summary: 'Good',
      observedAt: minutesAgo(3, now),
    },
    {
      source: 'atlanta-watershed',
      category: 'water_quality',
      value: null,
      unit: null,
      level: 'unhealthy',
      summary: 'Boil before use',
      observedAt: minutesAgo(10, now),
    },
    {
      source: 'nws',
      category: 'heat',
      value: 88,
      unit: '°F',
      level: 'moderate',
      summary: 'Moderate',
      observedAt: minutesAgo(3, now),
    },
    {
      source: 'fulton-health',
      category: 'mosquito',
      value: null,
      unit: null,
      level: 'good',
      summary: 'Low',
      observedAt: daysAgo(1, now),
    },
    {
      source: 'nws',
      category: 'temperature',
      value: 78,
      unit: '°F',
      level: 'good',
      summary: 'Partly cloudy',
      observedAt: minutesAgo(3, now),
      raw: {
        seeded: true,
        conditions: 'Partly cloudy',
        highF: 84,
        lowF: 69,
        hourly: [78, 81, 83, 82, 79].map((temperatureF, i) => ({
          time: hourMark(i, now),
          temperatureF,
        })),
      },
    },
  ].map((reading) => ({
    latitude: centroid.lat,
    longitude: centroid.lng,
    raw: { seeded: true },
    ...reading,
  }));

module.exports = {
  DEMO_PROFILE,
  alerts,
  events,
  housingResources,
  housingListings,
  libraryResources,
  blightReports,
  environmentalSources,
  environmentalReadings,
  et,
};
