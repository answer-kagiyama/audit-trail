/**
 * Story パネル。事件概要・いま調べること・獲得した証拠・ヒント。
 *
 * @see docs/game-design.md#story-画面
 */
import type { CaseData } from '../../game/caseTypes.ts';
import { findEvidence, findStoryBeat } from '../../game/caseTypes.ts';
import type { ProgressState } from '../../game/progression.ts';
import {
  activeObjectives,
  allObjectivesCompleted,
  canRevealAnswer,
  nextHintLevel,
  revealedHintsFor,
} from '../../game/progression.ts';
import { Panel } from '../Panel/Panel.tsx';
import { Prose } from '../Prose/Prose.tsx';
import styles from './StoryPanel.module.css';

export interface StoryPanelProps {
  caseData: CaseData;
  progress: ProgressState;
  /** 直前のクエリで獲得した証拠。強調表示に使う。 */
  justEarnedEvidence: readonly string[];
  /** セーブが破棄されたときの案内。 */
  notice?: string | undefined;
  onRevealHint: (objectiveId: string) => void;
  /** 答えを見る。SQLはエディタに差し込まれ、実行はプレイヤーがする。 */
  onRevealAnswer: (objectiveId: string) => void;
  onOpenFinalAnswer: () => void;
  onReset: () => void;
  /** カラムごと畳む。開き直すのは AppShell のレール。 */
  onCollapse: () => void;
}

export function StoryPanel({
  caseData,
  progress,
  justEarnedEvidence,
  notice,
  onRevealHint,
  onRevealAnswer,
  onOpenFinalAnswer,
  onReset,
  onCollapse,
}: StoryPanelProps) {
  const active = activeObjectives(caseData, progress);
  const total = caseData.story.objectives.length;
  const done = progress.completedObjectives.length;
  const ready = allObjectivesCompleted(caseData, progress);

  // 最後に開示されたストーリー断片だけを大きく見せる。全部並べると読み飛ばされる。
  const latestBeat = progress.storyBeats[progress.storyBeats.length - 1];

  return (
    <Panel title="Story" aside={`${String(done)} / ${String(total)}`} onCollapse={onCollapse}>
      <div className={styles.body}>
        {notice !== undefined && <p className={styles.notice}>{notice}</p>}

        <div className={styles.progress}>
          <div className={styles.bar}>
            <div
              className={styles.barFill}
              style={{ width: `${String(total === 0 ? 0 : (done / total) * 100)}%` }}
            />
          </div>
        </div>

        <details className={styles.prologue} open={done === 0}>
          <summary>{caseData.story.prologue.title}</summary>
          <Prose className={styles.prose} text={caseData.story.prologue.body} />
        </details>

        {latestBeat !== undefined && (
          <Prose
            className={styles.beat}
            text={findStoryBeat(caseData.story, latestBeat)?.body ?? ''}
          />
        )}

        {/* いま調べること。並行して複数 active になりうる。 */}
        {active.length > 0 && (
          <section className={styles.section}>
            <h3 className={styles.sectionTitle}>調査目的</h3>
            {active.map((objective) => {
              const hints = revealedHintsFor(caseData, progress, objective.id);
              const next = nextHintLevel(caseData, progress, objective.id);
              return (
                <div key={objective.id} className={styles.objective}>
                  <h4 className={styles.objectiveTitle}>{objective.title}</h4>
                  <Prose className={styles.objectiveBrief} text={objective.brief} />

                  {hints.length > 0 && (
                    <ul className={styles.hintList}>
                      {hints.map((hint) => (
                        <li key={hint.level} className={styles.hint}>
                          <span className={styles.hintLevel}>ヒント{hint.level}</span>
                          {hint.body}
                        </li>
                      ))}
                    </ul>
                  )}

                  {next === undefined ? (
                    <span className={styles.hintsDone}>ヒントはすべて開示済みです</span>
                  ) : (
                    <button
                      type="button"
                      className={styles.hintButton}
                      onClick={() => {
                        onRevealHint(objective.id);
                      }}
                    >
                      ヒントを見る（{next} / {caseData.hints[objective.id]?.length ?? 0}）
                    </button>
                  )}

                  {/* 最後の逃げ道。ヒントを全部開いたあとにだけ出す。
                      考える前に押せる場所に置くと、ヒントの意味が無くなる。 */}
                  {canRevealAnswer(caseData, progress, objective.id) && (
                    <button
                      type="button"
                      className={styles.answerButton}
                      onClick={() => {
                        onRevealAnswer(objective.id);
                      }}
                    >
                      答えを見る
                    </button>
                  )}

                  {progress.revealedAnswers.includes(objective.id) && (
                    <span className={styles.answerShown}>
                      答えをエディタに入れました。実行して確かめてください。
                    </span>
                  )}
                </div>
              );
            })}
          </section>
        )}

        {ready && (
          <div className={styles.actions}>
            <button type="button" className={styles.solve} onClick={onOpenFinalAnswer}>
              事件を解決する
            </button>
          </div>
        )}

        <section className={styles.section}>
          <h3 className={styles.sectionTitle}>獲得した証拠</h3>
          {progress.evidence.length === 0 ? (
            <p className={styles.empty}>まだありません。調査を進めてください。</p>
          ) : (
            <ul className={styles.evidenceList} aria-live="polite">
              {progress.evidence.map((id) => {
                const item = findEvidence(caseData.story, id);
                if (!item) return null;
                return (
                  <li
                    key={id}
                    className={`${styles.evidence} ${
                      justEarnedEvidence.includes(id) ? styles.evidenceNew : ''
                    }`}
                  >
                    <div className={styles.evidenceTitle}>{item.title}</div>
                    <Prose className={styles.evidenceBody} text={item.body} />
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        <div className={styles.actions}>
          <button type="button" className={styles.reset} onClick={onReset}>
            最初からやり直す
          </button>
        </div>
      </div>
    </Panel>
  );
}
