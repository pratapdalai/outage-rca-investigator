import React, { useEffect, useState } from 'react';
import ForgeReconciler, {
  Box, Stack, Inline, Text, Strong, Heading, Lozenge, Button, LoadingButton, SectionMessage, Spinner,
  Link, DynamicTable, EmptyState, BarChart, xcss,
} from '@forge/react';
import { invoke } from '@forge/bridge';

const stat = xcss({
  borderColor: 'color.border',
  borderStyle: 'solid',
  borderWidth: 'border.width',
  borderRadius: 'border.radius',
  padding: 'space.200',
  minWidth: '160px',
});

const CONF_APPEARANCE = { HIGH: 'removed', MEDIUM: 'moved', LOW: 'default' };

function Stat({ label, value }) {
  return (
    <Box xcss={stat}>
      <Stack space="space.050">
        <Text size="small" color="color.text.subtle">{label}</Text>
        <Heading size="large">{String(value)}</Heading>
      </Stack>
    </Box>
  );
}

function App() {
  const [state, setState] = useState({ loading: true });
  const [seeding, setSeeding] = useState(false);
  const [seeded, setSeeded] = useState(null);

  const load = async () => {
    setState({ loading: true });
    const r = await invoke('overview', { windowHours: 72 });
    setState(r.ok ? { loading: false, data: r.data } : { loading: false, error: r.error });
  };

  useEffect(() => {
    load();
  }, []);

  const seed = async () => {
    setSeeding(true);
    const r = await invoke('seedDemo', {});
    setSeeding(false);
    setSeeded(r.ok ? { ok: true, data: r.data } : { ok: false, error: r.error });
    if (r.ok) load();
  };

  const seedButton = (
    <LoadingButton appearance="primary" isLoading={seeding} onClick={seed}>
      Create demo telecom scenario
    </LoadingButton>
  );

  if (state.loading) {
    return (
      <Inline space="space.100" alignBlock="center">
        <Spinner />
        <Text>Loading outages and network changes…</Text>
      </Inline>
    );
  }
  if (state.error) {
    return (
      <SectionMessage appearance="error" title="Could not load the overview">
        <Text>{state.error}</Text>
      </SectionMessage>
    );
  }

  const d = state.data;
  const sd = seeded?.ok ? seeded.data : null;
  const seededTitle = !seeded?.ok ? 'Could not create demo data' : sd.alreadyExists ? 'Demo scenario already exists' : 'Demo scenario created';
  const seededMsg = seeded && (
    <SectionMessage appearance={!seeded.ok ? 'error' : sd.searchReady ? 'success' : 'warning'} title={seededTitle}>
      {seeded.ok ? (
        <Stack space="space.050">
          {sd.alreadyExists ? (
            <Text>{`This site already has the demo scenario (project ${sd.projectKey}). Using it again keeps the results clear: a second copy would compete with the first.`}</Text>
          ) : (
            <Text>{`Created ${sd.changes.length} change records (${sd.changeIssueType}) and ${sd.incidents.length} outage tickets (${sd.incidentIssueType}).`}</Text>
          )}
          {!sd.searchReady && (
            <Text>Jira is still indexing the new tickets. Wait about 10 seconds, then click Refresh before opening them.</Text>
          )}
          <Text>
            <Strong>Next:</Strong> {`open ${sd.mainIncident} and look at the "Outage root cause" panel.`}
          </Text>
        </Stack>
      ) : (
        <Text>{seeded.error}</Text>
      )}
    </SectionMessage>
  );

  if (!d.rows.length) {
    return (
      <Stack space="space.200">
        {seededMsg}
        <EmptyState
          header="No outage tickets in this project yet"
          description='Tag outage tickets with the label "outage" and change records with "network-change" (or use Incident / Change issue types). Or create a realistic fibre-broadband demo scenario in one click.'
          primaryAction={seedButton}
        />
      </Stack>
    );
  }

  const head = {
    cells: [
      { key: 'outage', content: 'Outage' },
      { key: 'detected', content: 'Detected' },
      { key: 'customers', content: 'Customers' },
      { key: 'suspect', content: 'Most likely cause' },
      { key: 'score', content: 'Confidence' },
    ],
  };
  const rows = d.rows.map((r) => ({
    key: r.key,
    cells: [
      { key: 'outage', content: <Inline space="space.050"><Link href={r.url}>{r.key}</Link><Text>{r.summary}</Text></Inline> },
      { key: 'detected', content: r.detectedAt ? new Date(r.detectedAt).toLocaleString() : '-' },
      { key: 'customers', content: r.customers ? r.customers.toLocaleString() : '-' },
      {
        key: 'suspect',
        content: r.topSuspect ? <Inline space="space.050"><Link href={r.topSuspect.url}>{r.topSuspect.key}</Link><Text>{r.topSuspect.summary}</Text></Inline> : 'No change in window',
      },
      {
        key: 'score',
        content: r.topSuspect ? <Lozenge appearance={CONF_APPEARANCE[r.topSuspect.confidence]}>{`${r.topSuspect.score} ${r.topSuspect.confidence}`}</Lozenge> : '-',
      },
    ],
  }));

  const totalCustomers = d.rows.reduce((s, r) => s + (r.customers || 0), 0);
  const explained = d.rows.filter((r) => r.topSuspect && r.topSuspect.confidence !== 'LOW').length;

  return (
    <Stack space="space.300">
      {seededMsg}
      <Inline space="space.200" shouldWrap>
        <Stat label="Outage tickets (45 days)" value={d.outagesTracked} />
        <Stat label="Change records checked" value={d.changesTracked} />
        <Stat label="Outages linked to a change" value={`${explained}/${d.rows.length}`} />
        <Stat label="Customers affected" value={totalCustomers.toLocaleString()} />
      </Inline>

      {d.topChanges.length > 0 && (
        <Stack space="space.100">
          <Heading size="small">Changes causing the most customer impact</Heading>
          <BarChart
            data={d.topChanges.map((c) => ({ change: c.key, customers: c.customers }))}
            xAccessor="change"
            yAccessor="customers"
            title="Customers affected by outages correlated to each change"
            height={240}
          />
        </Stack>
      )}

      <Stack space="space.100">
        <Heading size="small">Recent outages and their most likely cause</Heading>
        <DynamicTable head={head} rows={rows} rowsPerPage={10} />
      </Stack>

      <Inline space="space.100" alignBlock="center">
        {seedButton}
        <Button appearance="subtle" onClick={load}>Refresh</Button>
      </Inline>
    </Stack>
  );
}

ForgeReconciler.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
