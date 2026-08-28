import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useToast } from '@planner/ui';
import { ApiError, api } from '../api/client.js';
import { invalidateFocusScope } from '../api/queries.js';
import { FocusConflictModal, type FocusConflictInfo } from './FocusConflictModal.js';

export type ConflictMode = 'ask' | 'keepTask' | 'clearTask';

/**
 * Смена направления в фокусе. Логика одна на всё приложение: если активна
 * задача из другого направления, выбор делает пользователь, а не интерфейс.
 */
export function useFocusDirection(options: { onSettled?: () => void } = {}) {
  const qc = useQueryClient();
  const toast = useToast();
  const [conflict, setConflict] = useState<FocusConflictInfo | null>(null);

  const setDirection = useMutation({
    mutationFn: (vars: { directionId: string | null; onConflict: ConflictMode }) =>
      api.focus.setDirection(vars.directionId, vars.onConflict),
    onSuccess: (_data, vars) => {
      invalidateFocusScope(qc);
      setConflict(null);
      toast.show(vars.directionId ? 'Направление в фокусе' : 'Фокус снят');
      options.onSettled?.();
    },
    onError: (e) => {
      if (e instanceof ApiError && e.isFocusConflict) {
        setConflict(e.details as FocusConflictInfo);
        options.onSettled?.();
      } else {
        toast.show('Не удалось сменить направление');
      }
    },
  });

  const conflictModal = (
    <FocusConflictModal
      conflict={conflict}
      onClose={() => setConflict(null)}
      onKeepTask={() =>
        conflict &&
        setDirection.mutate({ directionId: conflict.requestedDirectionId, onConflict: 'keepTask' })
      }
      onClearTask={() =>
        conflict &&
        setDirection.mutate({ directionId: conflict.requestedDirectionId, onConflict: 'clearTask' })
      }
    />
  );

  return { setDirection, conflictModal };
}
