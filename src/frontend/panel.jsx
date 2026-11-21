import React, { useEffect, useState } from 'react';
import ForgeReconciler, {
  Box, Stack, Inline, Text, Strong, Lozenge, Badge, Button, LoadingButton, ProgressBar,
  SectionMessage, Spinner, Link, Tag, TagGroup, Select, Modal, ModalTransition, ModalHeader, ModalTitle,
  ModalBody, ModalFooter, xcss,
} from '@forge/react';
import { invoke } from '@forge/bridge';

const card = xcss({
  borderColor: 'color.border',
  borderStyle: 'solid',
  borderWidth: 'border.width',
  borderRadius: 'border.radius',
  padding: 'space.150',
});

const WINDOWS = [
  { label: 'Last 24 hours', value: 24 },
  { label: 'Last 72 hours', value: 72 },
  { label: 'Last 7 days', value: 168 },
];

const CONF = {
  HIGH: { lozenge: 'removed', bar: 'default', label: 'High confidence' },
  MEDIUM: { lozenge: 'moved', bar: 'default', label: 'Medium confidence' },
  LOW: { lozenge: 'default', bar: 'default', label: 'Low confidence' },
};

const VERDICT_APPEARANCE = { PROBABLE_CAUSE: 'error', LIKELY_CAUSE: 'warning', INCONCLUSIVE: 'information', NO_SUSPECT: 'success' };

const fmt = (iso) => (iso ? new Date(iso).toLocaleString() : 'unknown');
const mins = (m) => (m >= 60 ? `${Math.floor(m / 60)}h ${m % 60}m` : `${m}m`);

function Suspect({ s, rank, onConfirm, onOwner, owner, ownerLoading }) {
  const conf = CONF[s.confidence] || CONF.LOW;
  return (
    <Box xcss={card}>
      <Stack space="space.100">
        <Inline space="space.100" alignBlock="center" spread="space-between">
          <Inline space="space.100" alignBlock="center">
            <Badge appearance={rank === 1 ? 'important' : 'default'}>{`#${rank}`}</Badge>
            <Link href={s.url}>{s.key}</Link>
            <Text>{s.summary}</Text>
          </Inline>
          <Lozenge appearance={conf.lozenge} isBold={s.confidence === 'HIGH'}>{`${s.score}/100 · ${conf.label}`}</Lozenge>
        </Inline>
        <ProgressBar value={s.score / 100} ariaLabel={`Correlation score ${s.score} of 100`} />
        <Text size="small" color="color.text.subtle">
          {`Timing ${s.breakdown.temporal}/30 · Same elements ${s.breakdown.entity}/30 · Other outages ${s.breakdown.blast}/20 · Wording ${s.breakdown.text}/10 · Risk ${s.breakdown.risk}/10`}
        </Text>
        <Stack space="space.050">
          {s.evidence.map((e, i) => (
            <Text key={i} size="small">{`${e.factor === 'caveat' ? '⚠' : '•'} ${e.text}`}</Text>
          ))}
        </Stack>
        {s.relatedOutages?.length > 0 && (
          <Inline space="space.050" alignBlock="center" shouldWrap>
            <Text size="small"><Strong>Related outages:</Strong></Text>
            {s.relatedOutages.map((o) => (
              <Link key={o.key} href={o.url}>{o.key}</Link>
            ))}
          </Inline>
        )}
        {s.rollbackPlan && (
          <Stack space="space.050">
            <Text size="small"><Strong>Rollback plan (from the change record)</Strong></Text>
            {s.rollbackPlan.split('\n').map((l, i) => (
              <Text key={i} size="small">{l}</Text>
            ))}
          </Stack>
        )}
        {owner && (
          <SectionMessage appearance="information" title="Who to escalate to">
            <Text>{owner.escalateTo.length ? owner.escalateTo.join(', ') : 'No owner or team found for this change.'}</Text>
            {owner.teamworkGraph?.available && owner.teamworkGraph.recentComments.length > 0 && (
              <Text size="small">{`${owner.teamworkGraph.recentComments.length} comment(s) on this change in the last 7 days (Teamwork Graph).`}</Text>
            )}
            {!owner.teamworkGraph?.available && <Text size="small">Teamwork Graph not available on this site; showing the Jira assignee.</Text>}
          </SectionMessage>
        )}
        <Inline space="space.100">
          <Button appearance={rank === 1 ? 'primary' : 'default'} onClick={() => onConfirm(s)}>
            Confirm as root cause
          </Button>
          <LoadingButton isLoading={ownerLoading} onClick={() => onOwner(s)}>Who owns this change?</LoadingButton>
        </Inline>
      </Stack>
    </Box>
  );
}

function App() {
  const [windowHours, setWindowHours] = useState(72);
  const [state, setState] = useState({ loading: true });
  const [confirm, setConfirm] = useState(null);
  const [linking, setLinking] = useState(false);
  const [linked, setLinked] = useState(null);
  const [owners, setOwners] = useState({});
  const [ownerLoading, setOwnerLoading] = useState(null);

  const load = async (w = windowHours) => {
    setState({ loading: true });
    const r = await invoke('analyse', { windowHours: w });
    setState(r.ok ? { loading: false, data: r.data } : { loading: false, error: r.error });
  };

  useEffect(() => {
    load();
  }, []);

  const doLink = async () => {
    setLinking(true);
    const r = await invoke('linkCause', { changeKey: confirm.key, windowHours });
    setLinking(false);
    setConfirm(null);
    setLinked(r.ok ? { ok: true, text: r.data.message } : { ok: false, text: r.error });
  };

  const loadOwner = async (s) => {
    setOwnerLoading(s.key);
    const r = await invoke('changeContext', { changeKey: s.key });
    setOwnerLoading(null);
    if (r.ok) setOwners((o) => ({ ...o, [s.key]: r.data }));
  };

  if (state.loading) {
    return (
      <Inline space="space.100" alignBlock="center">
        <Spinner size="medium" />
        <Text>Correlating this outage with recent network changes…</Text>
      </Inline>
    );
  }
  if (state.error) {
    return (
      <SectionMessage appearance="error" title="Analysis failed">
        <Text>{state.error}</Text>
        <Button onClick={() => load()}>Retry</Button>
      </SectionMessage>
    );
  }

  const d = state.data;
  if (d.outagesAfterChange !== undefined) {
    // Opened on a change record: show its blast radius instead.
    return (
      <Stack space="space.150">
        <SectionMessage appearance={d.outagesAfterChange ? 'warning' : 'success'} title="This is a change record">
          <Text>{`${d.outagesAfterChange} outage ticket(s) on the same network elements since it was implemented, ${d.customersAffected.toLocaleString()} customers affected.`}</Text>
        </SectionMessage>
        {d.outages.map((o) => (
          <Inline key={o.key} space="space.100">
            <Link href={o.url}>{o.key}</Link>
            <Text>{`${o.summary} (+${mins(o.minutesAfterChange)})`}</Text>
          </Inline>
        ))}
      </Stack>
    );
  }

  const inc = d.incident;
  const ents = [...(inc.entities.elements || []), ...(inc.entities.versions || []), ...(inc.entities.sites || [])];

  return (
    <Stack space="space.200">
      <SectionMessage appearance={VERDICT_APPEARANCE[d.verdict.status] || 'information'} title="Root-cause verdict">
        <Text>{d.verdict.text}</Text>
      </SectionMessage>

      {linked && (
        <SectionMessage appearance={linked.ok ? 'success' : 'error'} title={linked.ok ? 'Root cause recorded' : 'Could not link'}>
          <Text>{linked.text}</Text>
        </SectionMessage>
      )}

      <Inline space="space.200" alignBlock="center" spread="space-between" shouldWrap>
        <Stack space="space.050">
          <Text size="small" color="color.text.subtle">{`Detected ${fmt(inc.detectedAt)} · ${inc.customersAffected ? `${inc.customersAffected.toLocaleString()} customers affected · ` : ''}${d.candidatesConsidered} changes checked`}</Text>
          {ents.length > 0 && (
            <TagGroup>
              {ents.map((e) => (
                <Tag key={e} text={e} />
              ))}
            </TagGroup>
          )}
        </Stack>
        <Box xcss={xcss({ width: '180px' })}>
          <Select
            options={WINDOWS}
            value={WINDOWS.find((w) => w.value === windowHours)}
            onChange={(o) => {
              setWindowHours(o.value);
              load(o.value);
            }}
          />
        </Box>
      </Inline>

      {d.suspects.length === 0 && (
        <Text>No changes were implemented in this window before the outage started.</Text>
      )}
      {d.suspects.slice(0, 3).map((s, i) => (
        <Suspect
          key={s.key}
          s={s}
          rank={i + 1}
          onConfirm={setConfirm}
          onOwner={loadOwner}
          owner={owners[s.key]}
          ownerLoading={ownerLoading === s.key}
        />
      ))}

      {d.excluded.length > 0 && (
        <Stack space="space.050">
          <Text size="small"><Strong>Ruled out</Strong></Text>
          {d.excluded.slice(0, 5).map((e) => (
            <Text key={e.key} size="small" color="color.text.subtle">{`${e.key}: ${e.reason}`}</Text>
          ))}
        </Stack>
      )}

      <Text size="small" color="color.text.subtle">
        Tip: open Rovo and ask the "Outage RCA Investigator" agent to draft the full RCA report.
      </Text>

      <ModalTransition>
        {confirm && (
          <Modal onClose={() => setConfirm(null)}>
            <ModalHeader>
              <ModalTitle>{`Link ${confirm.key} as the root cause?`}</ModalTitle>
            </ModalHeader>
            <ModalBody>
              <Text>
                {`This links ${confirm.key} to this outage and posts the evidence (score ${confirm.score}/100) as a comment. Only confirm after checking the change.`}
              </Text>
            </ModalBody>
            <ModalFooter>
              <Button appearance="subtle" onClick={() => setConfirm(null)}>Cancel</Button>
              <LoadingButton appearance="primary" isLoading={linking} onClick={doLink}>Link and comment</LoadingButton>
            </ModalFooter>
          </Modal>
        )}
      </ModalTransition>
    </Stack>
  );
}

ForgeReconciler.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
