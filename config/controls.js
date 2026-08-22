/*
 * CONTROL DEFINITIONS — this is the file you edit when insurer requirements change.
 *
 * Nothing in src/ knows anything about MFA, EDR or backups. It only knows how to
 * walk the structure below. Swapping in a real insurer questionnaire means editing
 * this file (or adding a sibling file and pointing QUESTIONNAIRE at it) — not the app.
 *
 * ---------------------------------------------------------------------------
 * SHAPE
 * ---------------------------------------------------------------------------
 * QUESTIONNAIRE = { id, version, name, source, controls: [Control] }
 *
 * Control = {
 *   id            Stable machine key. Never reuse an id for a different meaning —
 *                 historical evidence records are keyed on it.
 *   domain        Grouping shown as a section header in the questionnaire + report.
 *   title         Short human name.
 *   weight        Share of the 100-point readiness score. All weights should sum to 100.
 *   severity      'critical' | 'high' | 'moderate'. A failing 'critical' control caps
 *                 the overall verdict at "likely declined" regardless of score.
 *   insurerContext  One or two sentences on why carriers ask. Shown in the report.
 *   questions     [Question]
 * }
 *
 * Question = {
 *   id            Stable machine key, conventionally '<control>.<slug>'.
 *   prompt        The question as asked of the business.
 *   help          Optional clarifier shown under the prompt.
 *   type          'choice' | 'number'
 *   options       [{ value, label }]  — required for type 'choice'
 *   unit          Optional suffix shown next to a number input (e.g. '%').
 *   evaluation    How the answer maps to pass / partial / fail. See below.
 *   outcomes      { partial?: {gap, fix}, fail: {gap, fix} }
 *                 gap = the business consequence in plain language (no jargon,
 *                       no mechanism — what it costs them).
 *                 fix = what to actually do about it.
 * }
 *
 * ---------------------------------------------------------------------------
 * EVALUATION RULES
 * ---------------------------------------------------------------------------
 * type 'choice':
 *   evaluation: { pass: ['a','b'], partial: ['c'] }
 *   Any answered value not listed is a FAIL. Unanswered is UNKNOWN (scores as fail
 *   but is reported separately, because "we don't know" is its own finding).
 *
 * type 'number':
 *   evaluation: { pass: { gte: 95 }, partial: { gte: 80 } }
 *   Comparators: gte, gt, lte, lt, eq. First matching band wins (pass, then partial).
 *
 * A control's status is the worst status among its questions.
 */

export const QUESTIONNAIRE = {
  id: 'baseline-cyber-insurance',
  version: '2026.1',
  name: 'Cyber Insurance Readiness — Baseline Control Set',
  source:
    'Composite of the controls commonly required across SMB cyber policies. Replace with a specific carrier questionnaire when piloting against one.',

  controls: [
    // ---------------------------------------------------------------- MFA --
    {
      id: 'MFA_COVERAGE',
      domain: 'Identity & Access',
      title: 'Multi-factor authentication',
      weight: 20,
      severity: 'critical',
      insurerContext:
        'MFA is the single most common precondition for cyber cover. Most carriers will not quote a business that cannot confirm MFA on email and remote access, and several exclude funds-transfer fraud losses outright where it is missing.',
      questions: [
        {
          id: 'mfa.email',
          prompt: 'Is multi-factor authentication required for every employee email account?',
          help: 'Microsoft 365, Google Workspace, or whatever hosts your staff mailboxes.',
          type: 'choice',
          options: [
            { value: 'all', label: 'Yes — enforced for every user, no exceptions' },
            { value: 'most', label: 'Enforced for most users, a few are exempt' },
            { value: 'admins_only', label: 'Only for administrators / leadership' },
            { value: 'optional', label: 'Available, but users choose whether to turn it on' },
            { value: 'none', label: 'No' },
          ],
          evaluation: { pass: ['all'], partial: ['most'] },
          outcomes: {
            partial: {
              gap: 'A handful of exempt accounts is where attackers go first, and insurers know it. Carriers routinely ask who the exceptions are, and an exempt executive or finance mailbox is the version of this answer most likely to get your quote loaded or declined.',
              fix: 'Remove the exemptions. If a specific account genuinely cannot use MFA, document why in writing and restrict what it can reach — carriers accept a documented, contained exception far more readily than an undocumented one.',
            },
            fail: {
              gap: 'If one employee password is guessed or bought, an attacker can read and send email as that person. This is the route into invoice fraud, and it is the loss carriers most expect to pay out on. Without MFA on email you should assume you will either be declined or issued a policy that excludes exactly this.',
              fix: 'Turn on mandatory MFA for all mailboxes. On Microsoft 365 or Google Workspace this is a setting your IT provider can enforce in an afternoon, and it is the highest-value hour of work on this entire report.',
            },
          },
        },
        {
          id: 'mfa.remote_access',
          prompt: 'Is MFA required for remote access into your network (VPN, remote desktop, or similar)?',
          type: 'choice',
          options: [
            { value: 'all', label: 'Yes — required for all remote access' },
            { value: 'partial', label: 'Required for some systems but not all' },
            { value: 'none', label: 'No' },
            { value: 'no_remote', label: 'We have no remote access into the network' },
          ],
          evaluation: { pass: ['all', 'no_remote'], partial: ['partial'] },
          outcomes: {
            partial: {
              gap: 'Attackers scan continuously for the one remote entry point that was left alone. Partial coverage reads to an underwriter as no coverage, because a single unprotected path is all a ransomware crew needs.',
              fix: 'Inventory every way someone can reach the network from outside the office and put MFA in front of all of them. Anything that cannot take MFA should be turned off rather than left open.',
            },
            fail: {
              gap: 'Remote access without a second factor is the most common way ransomware gets into a business of your size. A stolen password becomes a full intrusion, and recovery costs run into weeks of downtime. Carriers treat this as close to uninsurable.',
              fix: 'Put MFA in front of every remote connection into the network, and disable any remote access route nobody can account for.',
            },
          },
        },
        {
          id: 'mfa.admin_accounts',
          prompt: 'Is MFA required for administrator accounts on your core systems?',
          help: 'The accounts that can create users, change security settings, or reach everyone\'s data.',
          type: 'choice',
          options: [
            { value: 'all', label: 'Yes — all administrator accounts' },
            { value: 'some', label: 'Some of them' },
            { value: 'none', label: 'No' },
          ],
          evaluation: { pass: ['all'], partial: ['some'] },
          outcomes: {
            partial: {
              gap: 'An administrator account without MFA is a master key with no lock. Carriers ask about this separately from ordinary staff because compromising one of these turns a contained incident into a total loss.',
              fix: 'Extend MFA to every account with administrative rights, including the ones your IT provider uses on your behalf.',
            },
            fail: {
              gap: 'The accounts that can reach everything in the business are protected by a password alone. If one is stolen, an attacker can disable your defences, delete your backups, and lock the business out — all before anyone notices. Underwriters price this as a worst-case exposure.',
              fix: 'Require MFA on every administrative account today, and keep the number of people holding one as small as you can.',
            },
          },
        },
      ],
    },

    // ---------------------------------------------------------------- EDR --
    {
      id: 'EDR_DEPLOYMENT',
      domain: 'Endpoint Protection',
      title: 'Endpoint detection & response',
      weight: 15,
      severity: 'critical',
      insurerContext:
        'Carriers distinguish sharply between traditional antivirus and monitored endpoint detection and response. The second is increasingly a condition of cover because it is what stops a ransomware attack mid-flight rather than reporting it afterwards.',
      questions: [
        {
          id: 'edr.tooling',
          prompt: 'What protection is installed on your computers and servers?',
          type: 'choice',
          options: [
            { value: 'edr_managed', label: 'Endpoint detection & response (EDR/MDR), monitored by a provider' },
            { value: 'edr_unmanaged', label: 'EDR software, but nobody is actively watching the alerts' },
            { value: 'av', label: 'Traditional antivirus only' },
            { value: 'builtin', label: 'Just whatever came with the operating system' },
            { value: 'none', label: 'Nothing / not sure' },
          ],
          evaluation: { pass: ['edr_managed'], partial: ['edr_unmanaged'] },
          outcomes: {
            partial: {
              gap: 'The tool will spot an attack in progress, but only if somebody reads the alert. Ransomware is typically deployed outside business hours precisely because nobody is looking. Insurers ask specifically whether alerts are monitored, and an unmonitored tool earns little credit.',
              fix: 'Have your IT provider take on monitoring and response for the alerts, so a detection at 2am produces action rather than an unread notification.',
            },
            fail: {
              gap: 'Traditional antivirus recognises attacks it has seen before. Modern ransomware is built specifically to look new, so it walks straight past. In practical terms this means an attacker can spend days inside the business without anything raising a flag — and carriers increasingly decline rather than price that.',
              fix: 'Move to a monitored endpoint detection and response product across all computers and servers. This is a standard MSP offering and the second-highest-value item on this report after MFA.',
            },
          },
        },
        {
          id: 'edr.coverage',
          prompt: 'What percentage of your computers and servers have that protection installed?',
          type: 'number',
          unit: '%',
          evaluation: { pass: { gte: 98 }, partial: { gte: 90 } },
          outcomes: {
            partial: {
              gap: 'The uncovered machines are the ones that will be hit. Underwriters read anything short of near-total coverage as a gap they cannot size, because neither can you.',
              fix: 'Reconcile the list of protected machines against your actual asset list and close the difference. The machines missing from an inventory are usually old servers, which are also the most vulnerable ones.',
            },
            fail: {
              gap: 'A meaningful share of your machines have no meaningful protection. An attacker only needs one. This also tells an underwriter that you do not have a reliable list of the computers in your business, which is itself a finding they will act on.',
              fix: 'Build a complete list of every computer and server, then get protection onto all of them. Retire anything that cannot take it.',
            },
          },
        },
      ],
    },

    // ------------------------------------------------------------ BACKUPS --
    {
      id: 'BACKUP_RECOVERY',
      domain: 'Resilience',
      title: 'Backups and tested recovery',
      weight: 15,
      severity: 'critical',
      insurerContext:
        'Backups decide the size of a ransomware claim. Carriers ask three things: are backups separated from the live network, how recent are they, and have you actually restored from them. The third question is where most businesses fail.',
      questions: [
        {
          id: 'backup.offline_copy',
          prompt: 'Is at least one backup copy kept where an attacker on your network cannot reach or delete it?',
          help: 'Offline, in a separate cloud account, or in immutable storage that cannot be overwritten.',
          type: 'choice',
          options: [
            { value: 'immutable', label: 'Yes — immutable or offline, separate credentials' },
            { value: 'separate_cloud', label: 'In a separate cloud service, but reachable with our normal logins' },
            { value: 'same_network', label: 'Backups live on the same network / same accounts' },
            { value: 'none', label: 'No backups, or not sure' },
          ],
          evaluation: { pass: ['immutable'], partial: ['separate_cloud'] },
          outcomes: {
            partial: {
              gap: 'If an attacker takes an administrator login, they can reach the backups with it. Ransomware crews delete backups first and demand payment second — a backup that shares your everyday credentials is one password away from being gone.',
              fix: 'Move backups behind credentials that are not used for anything else, and turn on immutability so a copy cannot be deleted or overwritten for a fixed retention window.',
            },
            fail: {
              gap: 'Backups reachable from the network you are trying to recover from are not a recovery plan — attackers encrypt them in the same pass. This turns a survivable incident into a business-threatening one, and it is the single strongest predictor of a large claim, which is exactly why carriers ask.',
              fix: 'Get one copy of your critical data into storage that cannot be deleted from your network, with its own separate login. This is inexpensive and is the difference between a bad week and an existential event.',
            },
          },
        },
        {
          id: 'backup.restore_test',
          prompt: 'When did you last actually restore data from backup to prove it works?',
          type: 'choice',
          options: [
            { value: 'lt_3m', label: 'Within the last 3 months' },
            { value: 'lt_12m', label: 'Within the last 12 months' },
            { value: 'gt_12m', label: 'More than a year ago' },
            { value: 'never', label: 'Never tested / not sure' },
          ],
          evaluation: { pass: ['lt_3m'], partial: ['lt_12m'] },
          outcomes: {
            partial: {
              gap: 'A year is long enough for the backup job to have quietly stopped covering something that now matters. Carriers ask for a recent test because untested backups fail at roughly the rate of tested ones succeeding.',
              fix: 'Run a restore test at least quarterly, and keep a one-page record of the date, what was restored, and how long it took. That record is what an underwriter wants to see.',
            },
            fail: {
              gap: 'You do not currently know whether your backups work. Most businesses that discover this discover it during a ransomware attack, when the answer arrives too late to do anything about. An underwriter will read an untested backup as no backup.',
              fix: 'Restore a real file and a full system from backup this month and write down what happened, including how long it took. Then repeat quarterly.',
            },
          },
        },
        {
          id: 'backup.frequency',
          prompt: 'How often is critical business data backed up?',
          type: 'choice',
          options: [
            { value: 'daily_or_better', label: 'Daily or more often' },
            { value: 'weekly', label: 'Weekly' },
            { value: 'adhoc', label: 'Occasionally / no set schedule' },
            { value: 'none', label: 'Not backed up' },
          ],
          evaluation: { pass: ['daily_or_better'], partial: ['weekly'] },
          outcomes: {
            partial: {
              gap: 'Weekly backups mean a bad day can cost you up to a week of work — invoices, orders and records that have to be reconstructed by hand while you are also recovering. Insurers translate that gap directly into business-interruption exposure.',
              fix: 'Move critical systems to at least daily backups. For finance and customer records, more often is worth the small extra cost.',
            },
            fail: {
              gap: 'Without a reliable schedule there is no dependable point to recover to, so the honest answer to "how much would we lose" is "we don\'t know". That uncertainty is what gets priced, and it is priced pessimistically.',
              fix: 'Put critical systems on an automatic daily backup schedule with alerts when a job fails.',
            },
          },
        },
      ],
    },

    // ------------------------------------------------------- EMAIL / DMARC --
    {
      id: 'EMAIL_SECURITY',
      domain: 'Email Security',
      title: 'Email filtering and domain protection',
      weight: 10,
      severity: 'high',
      insurerContext:
        'Most claims start in an inbox. Carriers look for filtering ahead of the mailbox and for DMARC, which stops criminals sending mail that appears to come from your own domain.',
      questions: [
        {
          id: 'email.filtering',
          prompt: 'Do you use email security filtering beyond what your mail provider includes by default?',
          type: 'choice',
          options: [
            { value: 'advanced', label: 'Yes — a dedicated filtering product with link and attachment scanning' },
            { value: 'builtin_plus', label: 'Provider built-in protection with the paid security add-on enabled' },
            { value: 'builtin', label: 'Just the default protection' },
            { value: 'none', label: 'None / not sure' },
          ],
          evaluation: { pass: ['advanced', 'builtin_plus'], partial: ['builtin'] },
          outcomes: {
            partial: {
              gap: 'Default filtering catches bulk spam but is weakest against the targeted message written specifically for your business — the fake invoice from a real supplier. That is the message that actually causes losses.',
              fix: 'Enable the paid security tier on your mail platform or add a dedicated filtering service. Both scan links and attachments at the moment the user clicks, not just on delivery.',
            },
            fail: {
              gap: 'Every fraudulent invoice and credential-harvesting message is arriving in front of your staff with nothing in the way, so your entire defence is whether a busy employee spots it. Carriers assume that fails eventually, because it does.',
              fix: 'Put a filtering layer in front of your mailboxes. This is a low-cost per-user subscription and removes the large majority of hostile mail before anyone sees it.',
            },
          },
        },
        {
          id: 'email.dmarc',
          prompt: 'Is DMARC configured on your domain to stop others sending email that appears to come from you?',
          help: 'Enforcement means a policy of "quarantine" or "reject" — not "none".',
          type: 'choice',
          options: [
            { value: 'enforced', label: 'Yes — set to quarantine or reject' },
            { value: 'monitor', label: 'Configured, but only in monitoring mode' },
            { value: 'none', label: 'Not configured / not sure' },
          ],
          evaluation: { pass: ['enforced'], partial: ['monitor'] },
          outcomes: {
            partial: {
              gap: 'Monitoring mode tells you when someone impersonates your domain but does not stop them. Your customers can still receive convincing fake invoices in your name, and the reputational and legal fallout lands on you.',
              fix: 'Move the policy from monitoring to quarantine, then to reject once your monitoring reports show legitimate mail is passing cleanly. Typically a few weeks of work.',
            },
            fail: {
              gap: 'Anyone can send email that appears to come from your business. The common version is a criminal emailing your customers a real-looking invoice with their own bank details — your customers lose money, and they come to you about it. Underwriters check this in seconds because it is public information.',
              fix: 'Publish SPF, DKIM and DMARC records for your domain and work up to an enforcing policy. This is a one-off configuration job with no ongoing licence cost.',
            },
          },
        },
      ],
    },

    // ------------------------------------------- ACCESS CONTROL / LEAVERS --
    {
      id: 'ACCESS_CONTROL',
      domain: 'Identity & Access',
      title: 'Access control and offboarding',
      weight: 10,
      severity: 'high',
      insurerContext:
        'Underwriters use offboarding as a proxy for whether a business has real process. Accounts belonging to people who left are a common finding in breach investigations and an easy one for a carrier to ask about.',
      questions: [
        {
          id: 'access.offboarding',
          prompt: 'How quickly is access removed when someone leaves the business?',
          type: 'choice',
          options: [
            { value: 'same_day', label: 'Same day, following a written checklist' },
            { value: 'within_week', label: 'Usually within a week' },
            { value: 'ad_hoc', label: 'When somebody remembers to ask' },
            { value: 'unknown', label: 'No defined process' },
          ],
          evaluation: { pass: ['same_day'], partial: ['within_week'] },
          outcomes: {
            partial: {
              gap: 'A week is a long window for a departure that did not end well, and it usually means the process depends on someone remembering rather than a checklist. Carriers ask whether the process is written down for exactly this reason.',
              fix: 'Write a one-page leaver checklist covering email, remote access, shared systems and any building or device access, and make same-day completion the standard.',
            },
            fail: {
              gap: 'Former employees may still be able to reach company email and files. Beyond the obvious risk from a disgruntled leaver, these forgotten accounts are unmonitored and unprotected — attackers look for them specifically. It also signals to an underwriter that security depends on memory rather than process.',
              fix: 'Create a written leaver checklist, run it the day someone leaves, and audit existing accounts now against your current staff list. That audit usually turns up more than expected.',
            },
          },
        },
        {
          id: 'access.least_privilege',
          prompt: 'Do employees have administrator rights on their own computers?',
          type: 'choice',
          options: [
            { value: 'none', label: 'No — standard user accounts only' },
            { value: 'few', label: 'A small number of documented exceptions' },
            { value: 'most', label: 'Most or all staff do' },
          ],
          evaluation: { pass: ['none'], partial: ['few'] },
          outcomes: {
            partial: {
              gap: 'Documented exceptions are acceptable to most carriers, but each one raises the ceiling on how much damage a single mistaken click can do.',
              fix: 'Review the exception list periodically and remove rights that are no longer needed. Keep the written justification current — it is what makes this defensible to an underwriter.',
            },
            fail: {
              gap: 'When staff have administrator rights, malware arriving through an email gets those same rights automatically — so one wrong click can install itself deeply rather than being contained to one user\'s files. Removing this is one of the cheapest ways to shrink the size of an incident.',
              fix: 'Move staff to standard accounts and grant administrative access only where a documented business need exists. Expect some friction in the first fortnight and very little after.',
            },
          },
        },
        {
          id: 'access.review',
          prompt: 'How often do you review who has access to what?',
          type: 'choice',
          options: [
            { value: 'quarterly', label: 'At least quarterly' },
            { value: 'annually', label: 'About once a year' },
            { value: 'never', label: 'Never / no formal review' },
          ],
          evaluation: { pass: ['quarterly'], partial: ['annually'] },
          outcomes: {
            partial: {
              gap: 'An annual review is enough to catch the worst drift but leaves most of the year uncovered. Access accumulates quietly as people change roles.',
              fix: 'Move to a quarterly review of who can reach financial systems, customer data and administrative tools, and keep the sign-off.',
            },
            fail: {
              gap: 'Access only ever accumulates. People change roles and keep everything they had, so over a few years ordinary staff end up able to reach far more than their job requires — which is exactly what an attacker inherits when they compromise one of those accounts.',
              fix: 'Run an access review now, starting with finance systems and customer data, then repeat quarterly with a record of who signed it off.',
            },
          },
        },
      ],
    },

    // ------------------------------------------------------------ PATCHING --
    {
      id: 'PATCH_MANAGEMENT',
      domain: 'Vulnerability Management',
      title: 'Patching and end-of-life systems',
      weight: 10,
      severity: 'high',
      insurerContext:
        'Carriers ask how fast critical patches land, and separately whether unsupported software is still running. Unsupported systems are a common explicit exclusion.',
      questions: [
        {
          id: 'patch.critical_window',
          prompt: 'How quickly are critical security updates applied after release?',
          type: 'choice',
          options: [
            { value: 'lt_14d', label: 'Within 14 days' },
            { value: 'lt_30d', label: 'Within 30 days' },
            { value: 'gt_30d', label: 'Longer than 30 days' },
            { value: 'unknown', label: 'No defined process / not sure' },
          ],
          evaluation: { pass: ['lt_14d'], partial: ['lt_30d'] },
          outcomes: {
            partial: {
              gap: 'Thirty days is workable but sits at the edge of what carriers accept. Attackers typically begin exploiting a serious flaw within days of it being announced, so the last three weeks of that window are exposed.',
              fix: 'Tighten the target to 14 days for critical updates, and keep the report showing what was patched and when.',
            },
            fail: {
              gap: 'Security updates fix flaws that are public knowledge the day they are announced, so a slow patch cycle means running known-vulnerable systems for weeks while attackers are actively scanning for them. Carriers view this as taking an avoidable risk, and it weakens your position if you ever need to claim.',
              fix: 'Have your IT provider run automated patching with a 14-day target for critical updates and a monthly report of anything that failed to apply.',
            },
          },
        },
        {
          id: 'patch.eol',
          prompt: 'Are you still running any software or operating systems that no longer receive security updates?',
          help: 'For example Windows Server 2012, Windows 7, or unsupported line-of-business applications.',
          type: 'choice',
          options: [
            { value: 'none', label: 'No' },
            { value: 'isolated', label: 'Yes, but they are isolated from the rest of the network' },
            { value: 'yes', label: 'Yes, in normal use' },
            { value: 'unknown', label: 'Not sure' },
          ],
          evaluation: { pass: ['none'], partial: ['isolated'] },
          outcomes: {
            partial: {
              gap: 'Isolation is the right interim answer and most carriers will accept it, provided you can describe the isolation. It is still a system that will never be fixed again, so it needs an end date.',
              fix: 'Document how the system is isolated and what it can still reach, and set a replacement date. Carriers respond well to a dated plan.',
            },
            fail: {
              gap: 'Unsupported software has flaws that will never be repaired, and those flaws are published. Many policies explicitly exclude losses arising from unsupported systems, so this can be the difference between a claim being paid and being refused — after you have already paid the premium.',
              fix: 'Identify every unsupported system, then either replace it or move it onto an isolated network with no internet access. Replacement is cheaper than the incident and far cheaper than a refused claim.',
            },
          },
        },
      ],
    },

    // -------------------------------------------------- INCIDENT RESPONSE --
    {
      id: 'INCIDENT_RESPONSE',
      domain: 'Governance',
      title: 'Incident response plan',
      weight: 8,
      severity: 'moderate',
      insurerContext:
        'Carriers ask whether a plan exists, whether it has been rehearsed, and whether it names the carrier\'s own notification line. Late notification is a common reason for a claim to be reduced.',
      questions: [
        {
          id: 'ir.plan',
          prompt: 'Do you have a written plan for what to do when a cyber incident happens?',
          type: 'choice',
          options: [
            { value: 'tested', label: 'Yes — written down and rehearsed in the last 12 months' },
            { value: 'written', label: 'Written down, but never rehearsed' },
            { value: 'informal', label: 'We would work it out / it is in people\'s heads' },
            { value: 'none', label: 'No' },
          ],
          evaluation: { pass: ['tested'], partial: ['written'] },
          outcomes: {
            partial: {
              gap: 'An unrehearsed plan is usually missing the practical details — who has the phone numbers when email is down, who can authorise taking systems offline. Those gaps only show up under pressure, when they cost hours.',
              fix: 'Run a one-hour tabletop exercise: talk through a ransomware Monday morning with the people who would actually be involved, and correct the plan where it broke. Keep a dated note that you did it.',
            },
            fail: {
              gap: 'The first hours of an incident decide how much it costs, and improvised decisions in those hours consistently make things worse — systems wiped before evidence is preserved, notification deadlines missed. Insurers also require prompt notification, and a business without a plan routinely calls its insurer days late, which can reduce what gets paid.',
              fix: 'Write a two-page plan: who to call first, how to reach people when email is down, who can decide to shut systems off, and the insurer notification number. Then talk it through once with the team.',
            },
          },
        },
        {
          id: 'ir.contacts',
          prompt: 'Do you know who to call in the first hour — IT provider, insurer, and legal?',
          type: 'choice',
          options: [
            { value: 'documented', label: 'Yes — written down and available offline' },
            { value: 'partial', label: 'Some of them' },
            { value: 'none', label: 'No' },
          ],
          evaluation: { pass: ['documented'], partial: ['partial'] },
          outcomes: {
            partial: {
              gap: 'The missing number is usually the insurer\'s, and that is the call with a deadline attached to it.',
              fix: 'Complete the contact list, including your policy number and the insurer notification line, and keep a printed copy somewhere that does not depend on the network.',
            },
            fail: {
              gap: 'During a real incident your email and files are typically unavailable — which is where the contact details live. Hours get lost finding phone numbers, and those are the hours that determine how far the damage spreads.',
              fix: 'Put a printed card in the office and in key people\'s wallets: IT provider, insurer notification line and policy number, legal contact, and bank fraud line.',
            },
          },
        },
      ],
    },

    // ------------------------------------------------------- AWARENESS --
    {
      id: 'SECURITY_AWARENESS',
      domain: 'People',
      title: 'Security awareness training',
      weight: 6,
      severity: 'moderate',
      insurerContext:
        'Training is standard on nearly every questionnaire. Carriers look for regular training rather than a one-off induction, and for simulated phishing as evidence it is working.',
      questions: [
        {
          id: 'awareness.training',
          prompt: 'How often do staff receive security awareness training?',
          type: 'choice',
          options: [
            { value: 'quarterly', label: 'Quarterly or more often' },
            { value: 'annually', label: 'Once a year' },
            { value: 'onboarding', label: 'Only at induction' },
            { value: 'none', label: 'None' },
          ],
          evaluation: { pass: ['quarterly'], partial: ['annually'] },
          outcomes: {
            partial: {
              gap: 'Annual training is the accepted minimum but decays quickly — recognition of a scam message drops off within a few months of the session.',
              fix: 'Move to short quarterly refreshers rather than one long annual session. Retention is markedly better and staff resent it less.',
            },
            fail: {
              gap: 'Your staff are the ones who receive the fraudulent invoices and the fake password reset messages, and without regular training they are being asked to spot professionally written scams with no preparation. This is also one of the easiest boxes on a questionnaire to tick, so not ticking it stands out.',
              fix: 'Put staff on a short recurring training programme. These are inexpensive per user and produce a completion record you can show an underwriter.',
            },
          },
        },
        {
          id: 'awareness.phishing_sim',
          prompt: 'Do you run simulated phishing tests?',
          type: 'choice',
          options: [
            { value: 'regular', label: 'Yes — regularly, with follow-up for those who click' },
            { value: 'occasional', label: 'Occasionally' },
            { value: 'none', label: 'No' },
          ],
          evaluation: { pass: ['regular'], partial: ['occasional'] },
          outcomes: {
            partial: {
              gap: 'Occasional tests give you a snapshot rather than a trend, so you cannot show an underwriter that things are improving.',
              fix: 'Move to a regular schedule and track the click rate over time. A falling click rate is a genuinely persuasive thing to put in front of a carrier.',
            },
            fail: {
              gap: 'Without simulations you have no idea how your staff actually behave when a convincing scam arrives — training completion tells you they sat through it, not that it worked. Carriers increasingly ask for click rates because it is the one measurable human-risk number.',
              fix: 'Add phishing simulation, usually bundled with the training platform, and use the results to target follow-up rather than to punish.',
            },
          },
        },
      ],
    },

    // ------------------------------------------------------- ENCRYPTION --
    {
      id: 'ENCRYPTION',
      domain: 'Data Protection',
      title: 'Encryption of devices and data',
      weight: 6,
      severity: 'moderate',
      insurerContext:
        'Encryption on laptops and phones limits the reporting obligations after a device is lost, which directly limits the cost of that event to the carrier.',
      questions: [
        {
          id: 'encryption.endpoints',
          prompt: 'Are laptops and mobile devices encrypted?',
          help: 'BitLocker on Windows, FileVault on Mac, and device encryption on phones.',
          type: 'choice',
          options: [
            { value: 'all', label: 'Yes — all of them, and we can prove it' },
            { value: 'most', label: 'Most of them' },
            { value: 'some', label: 'Some / not sure' },
            { value: 'none', label: 'No' },
          ],
          evaluation: { pass: ['all'], partial: ['most'] },
          outcomes: {
            partial: {
              gap: 'If the lost laptop turns out to be one of the unencrypted ones, you get the full breach-notification exercise anyway. Partial coverage does not reduce the obligation, it just changes the odds.',
              fix: 'Confirm encryption status across every device from your management tool and close the gaps, so you can produce evidence for any given device.',
            },
            fail: {
              gap: 'A laptop left in a taxi becomes a reportable data breach — customer notifications, possible regulatory attention, and the associated costs. Encrypted devices generally avoid that entirely, which is why the question is on every questionnaire.',
              fix: 'Turn on the encryption already built into Windows, macOS and mobile devices, and record it centrally so you can show which devices are covered.',
            },
          },
        },
        {
          id: 'encryption.sensitive_data',
          prompt: 'Is sensitive customer or financial data encrypted where it is stored?',
          type: 'choice',
          options: [
            { value: 'yes', label: 'Yes, and we know where that data lives' },
            { value: 'partial', label: 'Partly / we are not sure where all of it is' },
            { value: 'no', label: 'No' },
          ],
          evaluation: { pass: ['yes'], partial: ['partial'] },
          outcomes: {
            partial: {
              gap: 'Not knowing where sensitive data lives is the more serious half of this answer. After an incident you have to tell people what was exposed, and you cannot do that if you do not know what you held or where.',
              fix: 'Map where customer and financial data is stored — including the spreadsheets on individual machines — then apply encryption to those locations.',
            },
            fail: {
              gap: 'If someone reaches these systems, the data is readable and usable immediately. That is the difference between an incident you contain and one you have to notify customers and regulators about, which is where the real cost sits.',
              fix: 'Identify your sensitive data stores and turn on encryption at rest. Most cloud services offer this as a setting rather than a project.',
            },
          },
        },
      ],
    },
  ],
};
