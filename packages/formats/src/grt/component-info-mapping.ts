import type { ComponentInfo } from '../load/component-info.ts';
import type { GrtFields } from './grt-fields.ts';

/** Maps the authorship fields shared by GRT's component files. */
export function readComponentInfo(fields: GrtFields): ComponentInfo {
  return {
    description: fields.text('descr'),
    origin: fields.text('origin'),
    createdBy: fields.text('cby'),
    createdOn: fields.text('cdate'),
    modifiedBy: fields.text('mby'),
    modifiedOn: fields.text('mdate'),
  };
}
