// Demo scenario: a fibre-broadband (FTTH) operator. Six change records and six outage tickets with
// realistic telecom details. Times are relative to "now" so the scenario is always fresh.
//
// The story judges see: the most recent change before the main outage is an EMERGENCY DNS patch
// (a naive "blame the last change" rule would pick it). The engine instead ranks the OLT firmware
// upgrade first, because it touches the same OLT, the same firmware version shows up in the
// tickets, and three more outages hit the same OLT after the upgrade.

const H = 3600e3;

export function demoScenario(now = Date.now()) {
  const iso = (offsetHours) => new Date(now + offsetHours * H).toISOString();

  const changes = [
    {
      ref: 'C1',
      summary: 'Firmware upgrade OLT-BBSR-07 GPON line cards to v4.2.1',
      body: [
        'Change type: Normal',
        'Risk: Medium',
        `Implemented: ${iso(-5)}`,
        'Network element: OLT-BBSR-07',
        'Site: BBSR-EXCH-2',
        'Description: Upgrade GPON line card firmware from v4.1.9 to v4.2.1 on all 8 PON cards to fix ONT ranging defect.',
        'Implementation: Rolling reboot of line cards 1-8. Completed with warnings on card 3 (slow re-ranging).',
        '',
        'Rollback plan:',
        '1) Re-activate standby image v4.1.9 on each line card',
        '2) Reboot cards one at a time (approx 6 min per card)',
        '3) Verify ONT re-registration count returns to baseline (>98%)',
      ],
    },
    {
      ref: 'C2',
      summary: 'BGP policy update on RTR-CORE-02 - add prefix-list for new transit peer',
      body: [
        'Change type: Standard',
        'Risk: Low',
        `Implemented: ${iso(-30)}`,
        'Network element: RTR-CORE-02',
        'Site: BBSR-DC1',
        'Description: Add inbound prefix-list and route-map for the new upstream transit peer.',
        '',
        'Rollback plan:',
        'Remove route-map entry 40 and clear BGP session softly.',
      ],
    },
    {
      ref: 'C3',
      summary: 'EMERGENCY patch DNS resolver DNS-RES-01 to 9.18.24',
      body: [
        'Change type: Emergency',
        'Risk: High',
        `Implemented: ${iso(-2.5)}`,
        'Network element: DNS-RES-01',
        'Site: CTC-DC1',
        'Description: Emergency security patch for the recursive DNS resolver (vendor advisory). Service restarted.',
        '',
        'Rollback plan:',
        'Reinstall previous package 9.18.19 from local repository and restart the resolver.',
      ],
    },
    {
      ref: 'C4',
      summary: 'Certificate renewal on RADIUS server AAA-RAD-03',
      body: [
        'Change type: Standard',
        'Risk: Low',
        `Implemented: ${iso(-50)}`,
        'Network element: AAA-RAD-03',
        'Site: BBSR-DC1',
        'Description: Renew TLS certificate used for EAP authentication.',
        '',
        'Rollback plan:',
        'Restore previous certificate bundle from backup.',
      ],
    },
    {
      ref: 'C5',
      summary: 'Planned software upgrade BNG-CTC-01 (scheduled tomorrow night)',
      body: [
        'Change type: Normal',
        'Risk: Medium',
        `Implemented: ${iso(20)}`,
        'Network element: BNG-CTC-01',
        'Site: CTC-EXCH-1',
        'Description: Upgrade broadband network gateway software. Not yet executed.',
      ],
    },
    {
      ref: 'C6',
      summary: 'Power supply replacement on OLT-CTC-03',
      body: [
        'Change type: Standard',
        'Risk: Low',
        `Implemented: ${iso(-100)}`,
        'Network element: OLT-CTC-03',
        'Site: CTC-EXCH-1',
        'Description: Replace redundant PSU B after alarm.',
      ],
    },
  ];

  const incidents = [
    {
      ref: 'I1',
      main: true,
      summary: 'FTTH broadband down for customers in Patia - no PPPoE sessions',
      body: [
        `Detected: ${iso(-2)}`,
        'Customers affected: 1,240',
        'Network element: OLT-BBSR-07',
        'Site: BBSR-EXCH-2',
        'Symptoms: Customers report no internet. ONTs show LOS or are stuck in O5 after reboot. NOC sees PON ports 3/1-3/4 flapping on OLT-BBSR-07.',
        'Line card 3 reports firmware v4.2.1 and repeated re-ranging events.',
      ],
    },
    {
      ref: 'I2',
      summary: 'Multiple ONTs offline on OLT-BBSR-07 PON port 3/1',
      body: [
        `Detected: ${iso(-4.6)}`,
        'Customers affected: 380',
        'Network element: OLT-BBSR-07',
        'Site: BBSR-EXCH-2',
        'Symptoms: 61 ONTs deregistered within 10 minutes. Alarm: ONT dying gasp storm.',
      ],
    },
    {
      ref: 'I3',
      summary: 'Slow speeds and frequent drops in Chandrasekharpur',
      body: [
        `Detected: ${iso(-3.8)}`,
        'Customers affected: 520',
        'Network element: OLT-BBSR-07',
        'Symptoms: High BIP errors on line card 3 after firmware v4.2.1. Customers see drops every few minutes.',
      ],
    },
    {
      ref: 'I4',
      summary: 'IPTV channels freezing for subscribers on OLT-BBSR-07',
      body: [
        `Detected: ${iso(-3.1)}`,
        'Customers affected: 210',
        'Network element: OLT-BBSR-07',
        'Symptoms: Multicast streams freeze for 5-10 seconds. IGMP joins time out on PON card 3.',
      ],
    },
    {
      ref: 'I5',
      summary: 'Some websites not resolving for users in Cuttack',
      body: [
        `Detected: ${iso(-2.2)}`,
        'Customers affected: 90',
        'Network element: DNS-RES-01',
        'Site: CTC-DC1',
        'Symptoms: Intermittent SERVFAIL for some domains after resolver restart.',
      ],
    },
    {
      ref: 'I6',
      summary: 'Single customer reports Wi-Fi router keeps restarting',
      body: [
        `Detected: ${iso(-1)}`,
        'Customers affected: 1',
        'Symptoms: Customer premises router reboots every 20 minutes. Line is stable at the exchange.',
      ],
    },
  ];

  return { changes, incidents };
}

/** Pick the best issue type id from a project's issue types for a role. */
export function pickIssueType(types, role) {
  const usable = types.filter((t) => !t.subtask);
  const prefs = role === 'change' ? [/^change$/i, /change/i, /^task$/i] : [/^incident$/i, /incident/i, /^bug$/i, /^task$/i];
  for (const re of prefs) {
    const t = usable.find((x) => re.test(x.name));
    if (t) return t;
  }
  return usable[0] || null;
}
