/*
 * BRANDING — edit this to rebrand the gap report for an MSP.
 *
 * `logo` accepts either a URL or a data: URI. Leave it null to fall back to the
 * company initials in a coloured tile.
 */

export const BRANDING = {
  companyName: 'Northgate Managed IT',
  tagline: 'Cyber insurance readiness assessment',
  logo: null,
  accentColor: '#1f4ed8',

  contact: {
    email: 'security@northgate-it.example',
    phone: '+44 20 7946 0100',
    website: 'northgate-it.example',
  },

  // Printed at the foot of every report page.
  reportFooter:
    'Prepared by {companyName} for the named client. This assessment is based on information supplied by the client and reflects common cyber-insurance underwriting expectations. It is not a policy, a guarantee of cover, or a substitute for advice from your broker.',
};
