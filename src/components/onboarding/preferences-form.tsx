/**
 * File:        src/components/onboarding/preferences-form.tsx
 * Authors:     Roni Amiel & Eden Bitran
 * Description: Step 3 — how the student likes to study. These become the
 *              profile's DEFAULT preferences; per-course overrides are a
 *              planned extension.
 * Version:     0.10.0
 *
 * Modifications:
 *     0.10.0 - 2026-08-09 - Study format multi-select
 *     0.6.0 - 2026-08-05 - Initial implementation (Phase 1c)
 */

'use client';

import { ChoiceGroup } from '@/components/onboarding/choice-group';
import { StepForm } from '@/components/onboarding/step-form';
import {
  ENVIRONMENT_OPTIONS,
  GROUP_SIZE_OPTIONS,
  LANGUAGE_OPTIONS,
  STUDY_FORMAT_OPTIONS,
  TIME_BLOCK_OPTIONS,
} from '@/config/onboarding';
import { savePreferences } from '@/features/onboarding/actions';

export interface PreferencesFormProps {
  defaults: {
    preferredTimeBlocks: string[];
    studyEnvironments: string[];
    groupSizes: string[];
    studiesOnSaturday: boolean | null;
    studyFormats: string[];
    spokenLanguages: string[];
  };
}

/**
 * Renders the step 3 form.
 *
 * @param defaults - Existing answers, for a returning student.
 * @returns The form element.
 */
export function PreferencesForm({ defaults }: PreferencesFormProps) {
  return (
    <StepForm
      action={savePreferences}
      submitLabel="Continue"
      backHref="/onboarding/courses"
    >
      <ChoiceGroup
        name="preferredTimeBlocks"
        legend="When do you prefer to study?"
        description="Pick every slot that works — more answers mean more possible partners, not fewer."
        options={TIME_BLOCK_OPTIONS}
        defaultValue={defaults.preferredTimeBlocks}
      />

      <ChoiceGroup
        name="studyFormats"
        legend="How do you want to meet?"
        description="This one is a hard filter — we never suggest someone whose answer has no overlap with yours."
        options={STUDY_FORMAT_OPTIONS}
        defaultValue={defaults.studyFormats.length > 0 ? defaults.studyFormats : ['in_person']}
      />

      <ChoiceGroup
        name="studyEnvironments"
        legend="How do you like to work?"
        description="Both is a perfectly good answer."
        options={ENVIRONMENT_OPTIONS}
        defaultValue={defaults.studyEnvironments}
      />

      <ChoiceGroup
        name="groupSizes"
        legend="How many people?"
        options={GROUP_SIZE_OPTIONS}
        defaultValue={defaults.groupSizes}
      />

      <ChoiceGroup
        name="studiesOnSaturday"
        legend="Do you study on Saturday?"
        description="Shabbat is the one day the Israeli week reliably differs on, so it is worth asking outright."
        options={[
          { value: 'yes', label: 'Yes', icon: '✅' },
          { value: 'no', label: 'No', icon: '🚫' },
        ]}
        multiple={false}
        defaultValue={
          defaults.studiesOnSaturday === null
            ? []
            : [defaults.studiesOnSaturday ? 'yes' : 'no']
        }
      />

      <ChoiceGroup
        name="spokenLanguages"
        legend="Which languages can you study in?"
        description="A partner who wants Hebrew and one who wants English are a poor match however well their timetables line up."
        options={LANGUAGE_OPTIONS}
        defaultValue={defaults.spokenLanguages.length > 0 ? defaults.spokenLanguages : ['he']}
      />
    </StepForm>
  );
}
