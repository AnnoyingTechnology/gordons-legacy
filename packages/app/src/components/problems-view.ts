import type { SimulationProblem } from '@gordons-legacy/engine';
import { element } from '../dom.ts';
import { fieldAt } from '../editor/fields.ts';
import type { UiContext } from './context.ts';

/** Why the load can't be simulated: one line per problem, naming the field when the editor shows it. */
export function renderProblems(problems: SimulationProblem[], context: UiContext): HTMLElement {
  const { t } = context;
  return element('section', { class: 'simulation' }, [
    element('p', { class: 'error' }, [t('results.cannotSimulate')]),
    element('ul', { class: 'issues' }, problems.map((problem) => {
      const field = fieldAt(problem.path);
      const message = t(`problem.${problem.code}`);
      return element('li', { class: 'error' }, [
        element('span', { class: 'severity' }, ['!']),
        ` ${field ? `${t(field.label)}: ${message}` : message}`,
      ]);
    })),
  ]);
}
