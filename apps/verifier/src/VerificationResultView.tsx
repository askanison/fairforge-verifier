import type { VerificationResult } from '@fairforge/verifier';
import strings from './resources/en.json';

export type RecordSource = 'storage' | 'supplied' | 'none';

export function VerificationResultView({ result, record, source }: { result: VerificationResult; record: unknown; source: RecordSource }) {
  if (result.result !== 'VERIFIED') {
    return <section data-testid="verification-result" className="result-card">
      <span className="status-label">{result.result}</span>
      <h2>{strings.resultDetails[result.result]}</h2>
      <p>{strings.noSuccess}</p>
    </section>;
  }
  const submissionChecked = result.recordStatus === 'used' && record !== null && typeof record === 'object' && 'submission' in record && record.submission !== null && record.submission !== undefined;
  const title = result.evidence === 'none' ? strings.noneTitle : result.evidence === 'complete'
    ? source === 'storage' ? strings.completeStorage : strings.completeSupplied
    : source === 'storage' ? strings.partialStorage : strings.partialSupplied;
  const detail = result.evidence === 'complete' ? strings.completeDetail : result.evidence === 'partial' ? strings.partialDetail : strings.noneDetail;
  return <section data-testid="verification-result" className="result-card">
    <span className="status-label">{result.result}</span>
    <h2>{title}</h2>
    <p>{detail}</p>
    {result.evidence === 'none' ? <p>{result.recordStatus === 'unreadable' ? strings.unreadable : result.recordStatus === 'absent' ? strings.absent : strings.emptyRecord}</p> : null}
    <ul className="evidence-list">
      <li>{strings.evidence}: {result.evidence}</li>
      <li>{strings.recordStatus}: {result.recordStatus}</li>
      <li>{strings.submission}: {submissionChecked ? strings.checked : strings.unchecked}</li>
      <li>{strings.witnessed}: {result.witnessedSeqs.join(', ') || strings.noActions}</li>
      <li>{strings.unwitnessed}: {result.unwitnessedSeqs.join(', ') || strings.noActions}</li>
    </ul>
  </section>;
}
