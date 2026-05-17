// apps/plugin/src/lib/ui/friendly-errors.ts — Phase 02.2 Plan 07 Task 2.
//
// Plugin-owned friendly-error map. Each PluginErrorCode maps to a localized
// title + body + retry-CTA label. The plugin OWNS this copy per CONTEXT D-03b
// — the web app's getFriendlyImportError is the canonical map for the REST
// path, but the plugin path uses its own dialect (different recovery steps,
// different terminology). Duplicating the strings is preferred over a
// shared package in v1 (per D-04b accepted debt — same rationale as
// schemas.ts).
//
// All strings are Russian per UI-SPEC §"Copywriting Contract" (the phase
// ships ru-only; English i18n deferred to Phase 6).
//
// The seven codes covered here match the PluginErrorCode union in types.ts.
// Adding a new code MUST update both this map AND the union, or the TS
// exhaustiveness check at the bottom of getFriendlyError will fail to compile.

import type { PluginErrorCode } from '../../types';

export interface FriendlyError {
  /** Headline for the error card. 14/600. */
  title: string;
  /** Body explaining the cause + recovery hint. 14/400. */
  message: string;
  /** Label for the primary recovery CTA. 14/500. */
  retryLabel: string;
}

export function getFriendlyError(code: PluginErrorCode): FriendlyError {
  switch (code) {
    case 'plugin_no_prototype':
      return {
        title: 'Прототип не найден',
        message:
          'Этот Figma-файл не содержит прототипа. Добавьте flow в панели Prototype в Figma и попробуйте снова.',
        retryLabel: 'Обновить',
      };
    case 'plugin_no_session':
      return {
        title: 'Сессия истекла',
        message: 'Ваш вход в Maxytest истёк. Войдите снова, чтобы продолжить.',
        retryLabel: 'Войти заново',
      };
    case 'plugin_render_failed':
      return {
        title: 'Ошибка рендера',
        message:
          'Не удалось отрендерить один или несколько фреймов. Проверьте, что фреймы существуют, и попробуйте снова.',
        retryLabel: 'Попробовать снова',
      };
    case 'plugin_upload_failed':
      return {
        title: 'Ошибка загрузки',
        message:
          'Не удалось загрузить изображение фрейма в хранилище. Проверьте квоту воркспейса и подключение к сети.',
        retryLabel: 'Попробовать снова',
      };
    case 'plugin_rpc_failed':
      return {
        title: 'Ошибка сохранения',
        message:
          'Не удалось сохранить прототип. Проверьте свои права в воркспейсе — требуется роль owner или editor.',
        retryLabel: 'Попробовать снова',
      };
    case 'auth_timeout':
      return {
        title: 'Вход не удался',
        message: 'Сессия входа истекла за 10 минут. Попробуйте снова.',
        retryLabel: 'Попробовать снова',
      };
    case 'unknown_error':
      return {
        title: 'Что-то пошло не так',
        message:
          'Произошла неожиданная ошибка. Попробуйте снова. Если ошибка повторится, проверьте README плагина.',
        retryLabel: 'Попробовать снова',
      };
  }
  // Exhaustiveness fallback: if a new code is added to PluginErrorCode but
  // not to this switch, TypeScript flags `_exhaustive` as `never` mismatch.
  // We keep a runtime fallback string for forward-compat (the type-error
  // catches the omission at compile time).
  return assertNever(code);
}

function assertNever(code: never): FriendlyError {
  // Reading the value keeps it un-shaken by minifiers; the cast logs
  // a useful diagnostic if a future PluginErrorCode addition slips past
  // the type checker.
  console.warn(`[plugin] unhandled error code: ${String(code)}`);
  return {
    title: 'Что-то пошло не так',
    message:
      'Произошла неожиданная ошибка. Попробуйте снова. Если ошибка повторится, проверьте README плагина.',
    retryLabel: 'Попробовать снова',
  };
}
