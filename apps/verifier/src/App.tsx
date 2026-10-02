import { useEffect, useRef, useState } from 'react';
import { createVerifier, parseVerificationJson, type VerificationResult } from '@fairforge/verifier';
import strings from './resources/en.json';
import { webCryptoProvider } from './webCryptoProvider';
import { parseDeviceRecord, readDeviceRecord } from './deviceRecordInput';
import { VerificationResultView, type RecordSource } from './VerificationResultView';
import { buildIdentity } from './buildIdentity';

const verifier = createVerifier(webCryptoProvider);
type CompletedRun = { result: VerificationResult; record: unknown; source: RecordSource };

export function App() {
  const [payloadText, setPayloadText] = useState('');
  const [recordText, setRecordText] = useState('');
  const [source, setSource] = useState<RecordSource>('storage');
  const [recordReadFailed, setRecordReadFailed] = useState(false);
  const [completed, setCompleted] = useState<CompletedRun | null>(null);
  const [status, setStatus] = useState(strings.ready);
  const generation = useRef(0);
  useEffect(() => () => { generation.current++; }, []);

  function invalidate(message = strings.changed) {
    const token = ++generation.current;
    setCompleted(null);
    setStatus(message);
    return token;
  }

  function importFile(file: File | undefined, kind: 'payload' | 'record') {
    const token = invalidate(kind === 'payload' ? strings.readingPayload : strings.readingRecord);
    if (kind === 'payload') setPayloadText('');
    else { setSource('supplied'); setRecordText(''); setRecordReadFailed(false); }
    if (!file) { setStatus(strings.changed); return; }
    const reader = new FileReader();
    reader.onload = () => {
      if (generation.current !== token) return;
      if (typeof reader.result !== 'string') { failed(); return; }
      if (kind === 'payload') setPayloadText(reader.result);
      else setRecordText(reader.result);
      setStatus(strings.changed);
    };
    function failed() {
      if (generation.current !== token) return;
      if (kind === 'record') setRecordReadFailed(true);
      setStatus(kind === 'payload' ? strings.payloadReadError : strings.recordReadError);
    }
    reader.onerror = failed;
    reader.onabort = failed;
    try { reader.readAsText(file); } catch { failed(); }
  }

  async function verify() {
    const token = invalidate(strings.verifying);
    let payload: unknown;
    try { payload = parseVerificationJson(payloadText); }
    catch { setStatus(strings.inputError); return; }
    let record: unknown;
    if (source === 'supplied') record = recordReadFailed ? {} : parseDeviceRecord(recordText);
    else if (source === 'storage') {
      const round = payload !== null && typeof payload === 'object' && 'round' in payload ? payload.round : undefined;
      const id = round !== null && typeof round === 'object' && 'commitmentId' in round ? round.commitmentId : undefined;
      record = typeof id === 'string' ? readDeviceRecord(id) : undefined;
    }
    try {
      if (!globalThis.crypto?.subtle) { setStatus(strings.cryptoError); return; }
      const result = await verifier.verifyFull(payload, record);
      if (generation.current !== token) return;
      setCompleted({ result, record, source });
      setStatus(result.result === 'VERIFIED' ? `${result.result} — ${strings.evidence}: ${result.evidence}` : result.result);
    } catch {
      if (generation.current === token) setStatus(strings.operationError);
    }
  }

  return <>
    <a className="skip-link" href="#main">{strings.skip}</a>
    <div className="shell">
      <header>
        <div className="brand"><span className="brand-symbol" aria-hidden="true">◇</span>{strings.brand}</div>
        <span className="context">{strings.context}</span>
      </header>
      <main id="main" tabIndex={-1}>
        <p className="eyebrow">{strings.mode}</p>
        <h1>{strings.title}</h1>
        <section className="status-card" aria-labelledby="availability-heading">
          <span className="status-label">{strings.stage}</span>
          <h2 id="availability-heading">{strings.status}</h2>
          <p>{strings.detail}</p>
          <div className="input-group">
            <label htmlFor="payload">{strings.payloadLabel}</label>
            <textarea id="payload" value={payloadText} rows={10} spellCheck={false} aria-describedby="raw-help" onChange={event => { invalidate(); setPayloadText(event.target.value); }} />
            <label htmlFor="payload-file">{strings.payloadFile}</label>
            <input id="payload-file" type="file" accept=".json,application/json" onChange={event => { importFile(event.target.files?.[0], 'payload'); event.target.value = ''; }} />
            <p id="raw-help" className="help">{strings.rawHelp}</p>
          </div>
          <div className="input-group">
            <label htmlFor="record-source">{strings.recordSource}</label>
            <select id="record-source" value={source} aria-describedby="record-help storage-help" onChange={event => {
              invalidate();
              const value = event.target.value;
              if (value === 'storage' || value === 'supplied' || value === 'none') setSource(value);
            }}>
              <option value="storage">{strings.storageOption}</option>
              <option value="supplied">{strings.suppliedOption}</option>
              <option value="none">{strings.noneOption}</option>
            </select>
            <p id="record-help" className="help">{strings.recordHelp}</p>
            <p id="storage-help" className="help">{strings.storageHelp}</p>
            {source === 'supplied' ? <>
              <label htmlFor="record">{strings.recordLabel}</label>
              <textarea id="record" value={recordText} rows={7} spellCheck={false} onChange={event => { invalidate(); setRecordReadFailed(false); setRecordText(event.target.value); }} />
              <label htmlFor="record-file">{strings.recordFile}</label>
              <input id="record-file" type="file" accept=".json,application/json" onChange={event => { importFile(event.target.files?.[0], 'record'); event.target.value = ''; }} />
            </> : null}
          </div>
          <button type="button" onClick={() => { void verify(); }}>{strings.verify}</button>
          <p role="status" aria-live="polite" aria-atomic="true" className="operation-status">{status}</p>
        </section>
        {completed ? <VerificationResultView {...completed} /> : null}
        <section className="limits-card" data-testid="verification-limits" aria-labelledby="limits-heading">
          <h2 id="limits-heading">{strings.limitsTitle}</h2>
          <p>{strings.limits}</p><p>{strings.payoutLimits}</p>
        </section>
        <section className="build-identity" data-testid="build-identity" aria-labelledby="identity-heading">
          <h2 id="identity-heading">{strings.identityTitle}</h2>
          <p>{buildIdentity.sourceCommit === null || buildIdentity.dirty === null ? strings.identityUnavailable : <>{buildIdentity.dirty ? strings.identityDirty : strings.identityClean}: <code>{buildIdentity.sourceCommit}</code></>}</p>
          <p>{strings.packageVersion}: {buildIdentity.packageVersion}. {strings.identityCaveat}</p>
        </section>
      </main>
      <footer><span>{strings.footer}</span><span>{strings.notice}</span></footer>
    </div>
  </>;
}
