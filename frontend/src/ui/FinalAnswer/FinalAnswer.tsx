/**
 * 最終回答フォームとクリア画面。
 *
 * 自由入力ではなく構造化フォームにする。「田中」「田中誠」「TANAKA」の
 * 表記ゆれ吸収はゲームの本質ではなく、労力を割く価値がない
 * （docs/game-design.md#finalanswer最終回答）。
 *
 * 不正解でも回数制限は設けず、どこが違うかも言わない。
 * 総当たりを防ぐのは選択肢の数であって、回数制限ではない。
 */
import { useState } from 'react';
import { Dialog } from '@base-ui/react/dialog';
import type { CaseData } from '../../game/caseTypes.ts';
import type { ProgressState } from '../../game/progression.ts';
import { totalHintsRevealed } from '../../game/progression.ts';
import { Prose } from '../Prose/Prose.tsx';
import styles from './FinalAnswer.module.css';

export interface FinalAnswerDialogProps {
  caseData: CaseData;
  progress: ProgressState;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** 正解なら true を返す。 */
  onSubmit: (answers: Record<string, string>) => boolean;
}

export function FinalAnswerDialog({
  caseData,
  progress,
  open,
  onOpenChange,
  onSubmit,
}: FinalAnswerDialogProps) {
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [rejected, setRejected] = useState(false);

  const { fields } = caseData.solution.finalAnswer;
  const complete = fields.every((field) => (answers[field.id] ?? '') !== '');
  const cleared = progress.clearedAt !== null;

  const submit = () => {
    const correct = onSubmit(answers);
    setRejected(!correct);
  };

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Backdrop className={styles.backdrop} />
        <Dialog.Popup className={styles.popup}>
          {cleared ? (
            <ClearedView
              caseData={caseData}
              progress={progress}
              onClose={() => onOpenChange(false)}
            />
          ) : (
            <>
              <Dialog.Title className={styles.title}>事件を解決する</Dialog.Title>
              <p className={styles.lead}>
                集めた証跡から、何が起きたのかを組み立ててください。 回数制限はありません。
              </p>

              <div className={styles.fields}>
                {fields.map((field) => (
                  <div key={field.id} className={styles.field}>
                    <label className={styles.label} htmlFor={`final-${field.id}`}>
                      {field.label}
                    </label>
                    <select
                      id={`final-${field.id}`}
                      className={styles.select}
                      value={answers[field.id] ?? ''}
                      onChange={(event) => {
                        setRejected(false);
                        setAnswers((previous) => ({
                          ...previous,
                          [field.id]: event.target.value,
                        }));
                      }}
                    >
                      <option value="">選択してください</option>
                      {field.options.map((option) => (
                        <option key={option} value={option}>
                          {option}
                        </option>
                      ))}
                    </select>
                  </div>
                ))}
              </div>

              {rejected && (
                <p className={styles.rejected}>
                  その推理では説明できない点があります。証跡を読み直してください。
                </p>
              )}

              <div className={styles.actions}>
                <button type="button" className={styles.cancel} onClick={() => onOpenChange(false)}>
                  調査に戻る
                </button>
                <button
                  type="button"
                  className={styles.submit}
                  disabled={!complete}
                  onClick={submit}
                >
                  この推理で提出する
                </button>
              </div>
            </>
          )}
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

function ClearedView({
  caseData,
  progress,
  onClose,
}: {
  caseData: CaseData;
  progress: ProgressState;
  onClose: () => void;
}) {
  const minutes = Math.max(
    1,
    Math.round(((progress.clearedAt ?? progress.startedAt) - progress.startedAt) / 60_000),
  );

  return (
    <div className={styles.cleared}>
      <span className={styles.clearedBadge}>解決</span>
      <Dialog.Title className={styles.title}>{caseData.story.epilogue.title}</Dialog.Title>

      {/* クリア画面の主役はエピローグ。学習達成バッジのようなものは出さない
          （docs/game-design.md#7-クリア体験）。 */}
      <Prose className={styles.epilogue} text={caseData.story.epilogue.body} />

      <div className={styles.record}>
        <div className={styles.recordItem}>
          <span className={styles.recordLabel}>所要時間</span>
          <span className={styles.recordValue}>{minutes} 分</span>
        </div>
        <div className={styles.recordItem}>
          <span className={styles.recordLabel}>実行クエリ</span>
          <span className={styles.recordValue}>{progress.queryCount}</span>
        </div>
        <div className={styles.recordItem}>
          <span className={styles.recordLabel}>ヒント使用</span>
          <span className={styles.recordValue}>{totalHintsRevealed(progress)}</span>
        </div>
        <div className={styles.recordItem}>
          <span className={styles.recordLabel}>回答試行</span>
          <span className={styles.recordValue}>{progress.finalAnswerAttempts}</span>
        </div>
      </div>

      <div className={styles.actions}>
        <button type="button" className={styles.submit} onClick={onClose}>
          閉じる
        </button>
      </div>
    </div>
  );
}
