"use client";

import { useTranslations } from "next-intl";
import {
  APPEARANCE_EXPRESSION_LIMIT,
  APPEARANCE_FEATURE_LIMIT,
  APPEARANCE_NOTE_EXAMPLES,
  APPEARANCE_NOTE_MAX_LENGTH,
  CLOTHING_VIBE_OPTIONS,
  createEmptyChildAppearance,
  DISTINGUISHING_FEATURE_OPTIONS,
  EYE_COLOR_OPTIONS,
  EXPRESSION_VIBE_OPTIONS,
  FAVORITE_CLOTHING_ITEM_OPTIONS,
  FEATURE_EMPHASIS_OPTIONS,
  getAppearanceOptionLabel,
  HAIR_COLOR_OPTIONS,
  HAIR_LENGTH_OPTIONS,
  HAIR_STYLE_OPTIONS,
  HAIR_TEXTURE_OPTIONS,
  SKIN_TONE_OPTIONS,
  type ChildAppearance,
  type ClothingVibeOption,
  type DistinguishingFeatureOption,
  type ExpressionVibeOption,
  type FavoriteClothingItemOption,
  type FeatureEmphasisOption,
  type HairStyleOption,
  UNDERTONE_OPTIONS,
} from "@/types";
import { storycotTheme } from "@/lib/theme";

function SelectField<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value?: T;
  options: readonly T[];
  onChange: (value?: T) => void;
}) {
  return (
    <div>
      <label className="mb-1.5 block text-sm font-bold text-night-700">
        {label}
      </label>
      <select
        value={value ?? ""}
        onChange={(e) =>
          onChange((e.target.value || undefined) as T | undefined)
        }
        className="w-full rounded-xl border border-night-200 bg-white px-3 py-2.5 text-sm outline-none focus:border-star-400 focus:ring-2 focus:ring-star-200"
      >
        <option value="">—</option>
        {options.map((option) => (
          <option key={option} value={option}>
            {getAppearanceOptionLabel(option)}
          </option>
        ))}
      </select>
    </div>
  );
}

function SwatchField<T extends string>({
  label,
  value,
  options,
  swatches,
  onChange,
}: {
  label: string;
  value?: T;
  options: readonly T[];
  swatches: Record<T, string>;
  onChange: (value?: T) => void;
}) {
  return (
    <div>
      <label className="mb-2 block text-sm font-bold text-night-700">
        {label}
      </label>
      <div className="flex flex-wrap gap-2">
        {options.map((option) => {
          const active = value === option;
          return (
            <button
              key={option}
              type="button"
              onClick={() => onChange(active ? undefined : option)}
              className={`flex items-center gap-2 rounded-full border px-3 py-2 text-sm font-medium transition ${
                active
                  ? "border-night-700 bg-night-50 text-night-800"
                  : "border-night-200 bg-white text-night-600 hover:border-night-400"
              }`}
            >
              <span
                className="h-5 w-5 rounded-full border border-black/10"
                style={{ backgroundColor: swatches[option] }}
              />
              <span>{getAppearanceOptionLabel(option)}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function MultiChoiceField<T extends string>({
  label,
  values,
  options,
  limit,
  onChange,
}: {
  label: string;
  values: T[];
  options: readonly T[];
  limit?: number;
  onChange: (values: T[]) => void;
}) {
  return (
    <div>
      <label className="mb-2 block text-sm font-bold text-night-700">
        {label}
      </label>
      <div className="flex flex-wrap gap-2">
        {options.map((option) => {
          const active = values.includes(option);
          const blocked =
            !active && typeof limit === "number" && values.length >= limit;
          return (
            <button
              key={option}
              type="button"
              disabled={blocked}
              onClick={() =>
                onChange(
                  active
                    ? values.filter((value) => value !== option)
                    : [...values, option]
                )
              }
              className={`rounded-full px-3 py-1.5 text-sm font-medium transition disabled:opacity-50 ${
                active
                  ? "bg-night-700 text-moon-100"
                  : "border border-night-200 bg-white text-night-600 hover:border-night-400"
              }`}
            >
              {getAppearanceOptionLabel(option)}
            </button>
          );
        })}
      </div>
      {limit ? (
        <p className="mt-2 text-xs text-night-400">
          {label.includes("Expression")
            ? `${values.length}/${limit}`
            : `${values.length}/${limit}`}
        </p>
      ) : null}
    </div>
  );
}

function StyleTiles({
  label,
  values,
  options,
  onChange,
}: {
  label: string;
  values: HairStyleOption[];
  options: readonly HairStyleOption[];
  onChange: (values: HairStyleOption[]) => void;
}) {
  return (
    <div>
      <label className="mb-2 block text-sm font-bold text-night-700">
        {label}
      </label>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        {options.map((option) => {
          const active = values.includes(option);
          return (
            <button
              key={option}
              type="button"
              onClick={() =>
                onChange(
                  active
                    ? values.filter((value) => value !== option)
                    : [...values, option]
                )
              }
              className={`rounded-2xl border px-3 py-3 text-left text-sm transition ${
                active
                  ? "border-night-700 bg-night-50 text-night-800"
                  : "border-night-200 bg-white text-night-600 hover:border-night-400"
              }`}
            >
              <span className="block font-semibold">
                {getAppearanceOptionLabel(option)}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

export default function AppearanceFields({
  appearance,
  onChange,
}: {
  appearance?: ChildAppearance;
  onChange: (appearance: ChildAppearance) => void;
}) {
  const t = useTranslations("profiles");
  const state = appearance ?? createEmptyChildAppearance();

  function patch(next: Partial<ChildAppearance>) {
    onChange({
      ...state,
      ...next,
    });
  }

  return (
    <section className="space-y-6 rounded-3xl border border-night-100 bg-white p-6 shadow-sm">
      <div>
        <h2 className="font-display text-2xl font-bold text-night-800">
          {t("appearanceSectionTitle")}
        </h2>
        <p className="mt-1 text-sm text-night-500">
          {t("appearanceSectionSub")}
        </p>
      </div>

      <div className="space-y-5 rounded-2xl bg-night-50/50 p-4">
        <div>
          <h3 className="font-display text-lg font-bold text-night-700">
            {t("appearanceCoreTitle")}
          </h3>
          <p className="mt-1 text-sm text-night-500">
            {t("appearanceCoreSub")}
          </p>
        </div>
        <SwatchField
          label={t("appearanceSkinToneLabel")}
          value={state.skinTone}
          options={SKIN_TONE_OPTIONS}
          swatches={storycotTheme.appearance.skin}
          onChange={(skinTone) => patch({ skinTone })}
        />
        <SelectField
          label={t("appearanceUndertoneLabel")}
          value={state.undertone}
          options={UNDERTONE_OPTIONS}
          onChange={(undertone) => patch({ undertone })}
        />
        <SwatchField
          label={t("appearanceHairColorLabel")}
          value={state.hairColor}
          options={HAIR_COLOR_OPTIONS}
          swatches={storycotTheme.appearance.hair}
          onChange={(hairColor) => patch({ hairColor })}
        />
        <div className="grid gap-4 sm:grid-cols-2">
          <SelectField
            label={t("appearanceHairTextureLabel")}
            value={state.hairTexture}
            options={HAIR_TEXTURE_OPTIONS}
            onChange={(hairTexture) => patch({ hairTexture })}
          />
          <SelectField
            label={t("appearanceHairLengthLabel")}
            value={state.hairLength}
            options={HAIR_LENGTH_OPTIONS}
            onChange={(hairLength) => patch({ hairLength })}
          />
        </div>
        <StyleTiles
          label={t("appearanceHairStyleLabel")}
          values={state.hairStyles}
          options={HAIR_STYLE_OPTIONS}
          onChange={(hairStyles) => patch({ hairStyles })}
        />
        <SwatchField
          label={t("appearanceEyeColorLabel")}
          value={state.eyeColor}
          options={EYE_COLOR_OPTIONS}
          swatches={storycotTheme.appearance.eyes}
          onChange={(eyeColor) => patch({ eyeColor })}
        />
      </div>

      <div className="space-y-5 rounded-2xl bg-night-50/50 p-4">
        <div>
          <h3 className="font-display text-lg font-bold text-night-700">
            {t("appearanceDetailsTitle")}
          </h3>
          <p className="mt-1 text-sm text-night-500">
            {t("appearanceDetailsSub")}
          </p>
        </div>
        <MultiChoiceField<FeatureEmphasisOption>
          label={t("appearanceFeatureEmphasisLabel")}
          values={state.featureEmphasis}
          options={FEATURE_EMPHASIS_OPTIONS}
          limit={APPEARANCE_FEATURE_LIMIT}
          onChange={(featureEmphasis) => patch({ featureEmphasis })}
        />
        <MultiChoiceField<DistinguishingFeatureOption>
          label={t("appearanceDistinguishingFeaturesLabel")}
          values={state.distinguishingFeatures}
          options={DISTINGUISHING_FEATURE_OPTIONS}
          limit={APPEARANCE_FEATURE_LIMIT}
          onChange={(distinguishingFeatures) =>
            patch({ distinguishingFeatures })
          }
        />
        <div className="grid gap-4 sm:grid-cols-2">
          <SelectField<ClothingVibeOption>
            label={t("appearanceClothingVibeLabel")}
            value={state.clothingVibe}
            options={CLOTHING_VIBE_OPTIONS}
            onChange={(clothingVibe) => patch({ clothingVibe })}
          />
          <SelectField<FavoriteClothingItemOption>
            label={t("appearanceFavoriteClothingItemLabel")}
            value={state.favoriteClothingItem}
            options={FAVORITE_CLOTHING_ITEM_OPTIONS}
            onChange={(favoriteClothingItem) => patch({ favoriteClothingItem })}
          />
        </div>
        <MultiChoiceField<ExpressionVibeOption>
          label={t("appearanceExpressionLabel")}
          values={state.expressionVibes}
          options={EXPRESSION_VIBE_OPTIONS}
          limit={APPEARANCE_EXPRESSION_LIMIT}
          onChange={(expressionVibes) => patch({ expressionVibes })}
        />
      </div>

      <div className="space-y-3 rounded-2xl bg-night-50/50 p-4">
        <div>
          <h3 className="font-display text-lg font-bold text-night-700">
            {t("appearanceNoteTitle")}
          </h3>
          <p className="mt-1 text-sm text-night-500">
            {t("appearanceNoteSub")}
          </p>
        </div>
        <textarea
          value={state.consistencyNote ?? ""}
          onChange={(e) =>
            patch({
              consistencyNote: e.target.value.slice(
                0,
                APPEARANCE_NOTE_MAX_LENGTH
              ),
            })
          }
          maxLength={APPEARANCE_NOTE_MAX_LENGTH}
          placeholder={t("appearanceNotePlaceholder")}
          className="min-h-24 w-full rounded-2xl border border-night-200 bg-white px-4 py-3 text-sm outline-none focus:border-star-400 focus:ring-2 focus:ring-star-200"
        />
        <div className="flex items-center justify-between text-xs text-night-400">
          <span>
            {t("appearanceNoteLimit", { count: APPEARANCE_NOTE_MAX_LENGTH })}
          </span>
          <span>
            {(state.consistencyNote ?? "").length}/{APPEARANCE_NOTE_MAX_LENGTH}
          </span>
        </div>
        <div className="rounded-2xl border border-dashed border-night-200 bg-white px-4 py-3 text-xs text-night-500">
          <p className="font-semibold text-night-600">
            {t("appearanceNoteExamplesLabel")}
          </p>
          <ul className="mt-2 space-y-1">
            {APPEARANCE_NOTE_EXAMPLES.map((example) => (
              <li key={example}>• {example}</li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  );
}
