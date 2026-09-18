import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Button, Checkbox, FormField, Modal, useToast } from '@planner/ui';
import {
  TRIP_PURPOSE_LABELS,
  TRIP_TRANSPORT_LABELS,
  tripPurpose,
  tripTransport,
  type TripConditions,
  type TripPurpose,
  type TripTransport,
} from '@planner/contracts';
import { diffDays } from '@planner/shared';
import { api } from '../api/client.js';
import { qk } from '../api/queries.js';

const STEP_TITLES = ['Куда', 'Когда', 'Зачем', 'Транспорт', 'Условия'];

const DEFAULT_CONDITIONS: TripConditions = {
  canLaundry: false,
  needsLaptop: false,
  seaOrPool: false,
  activeOutdoor: false,
  specialEvent: false,
  comment: null,
};

/**
 * Короткий визард создания поездки, ровно пять шагов из ТЗ. Ничего не
 * обязательно, кроме дат — остальное можно доопределить потом в параметрах
 * поездки.
 */
export function NewTripWizard({
  open,
  onOpenChange,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated: (tripId: string) => void;
}) {
  const qc = useQueryClient();
  const toast = useToast();
  const [step, setStep] = useState(0);
  const [country, setCountry] = useState('');
  const [city, setCity] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [purposes, setPurposes] = useState<TripPurpose[]>([]);
  const [transport, setTransport] = useState<TripTransport[]>([]);
  const [conditions, setConditions] = useState<TripConditions>(DEFAULT_CONDITIONS);

  const reset = () => {
    setStep(0);
    setCountry('');
    setCity('');
    setStartDate('');
    setEndDate('');
    setPurposes([]);
    setTransport([]);
    setConditions(DEFAULT_CONDITIONS);
  };

  const create = useMutation({
    mutationFn: async () => {
      const trip = await api.travel.createTrip({
        country: country.trim(),
        city: city.trim() || null,
        startDate,
        endDate,
        purposes,
        transport,
        conditions,
      });
      await api.travel.refreshChecklist(trip.id);
      return trip;
    },
    onSuccess: (trip) => {
      void qc.invalidateQueries({ queryKey: qk.trips });
      toast.show('Поездка создана. Чек-лист собран по вашей базе вещей.');
      onOpenChange(false);
      reset();
      onCreated(trip.id);
    },
    onError: () => toast.show('Не удалось создать поездку'),
  });

  const toggle = <T,>(list: T[], value: T): T[] =>
    list.includes(value) ? list.filter((v) => v !== value) : [...list, value];

  const canGoNext = step === 1 ? Boolean(startDate && endDate) : true;
  const duration = startDate && endDate ? diffDays(endDate, startDate) + 1 : null;

  return (
    <Modal
      open={open}
      onOpenChange={(v) => {
        onOpenChange(v);
        if (!v) reset();
      }}
      title={`Новая поездка · ${STEP_TITLES[step]}`}
      description={`Шаг ${step + 1} из ${STEP_TITLES.length}`}
      footer={
        <>
          {step > 0 ? (
            <Button variant="ghost" onClick={() => setStep((s) => s - 1)}>
              Назад
            </Button>
          ) : (
            <Button variant="ghost" onClick={() => onOpenChange(false)}>
              Отмена
            </Button>
          )}
          {step < STEP_TITLES.length - 1 ? (
            <Button variant="primary" disabled={!canGoNext} onClick={() => setStep((s) => s + 1)}>
              Далее
            </Button>
          ) : (
            <Button
              variant="primary"
              disabled={!country.trim() || !startDate || !endDate || create.isPending}
              onClick={() => create.mutate()}
            >
              Создать поездку
            </Button>
          )}
        </>
      }
    >
      {step === 0 ? (
        <>
          <FormField label="Страна">
            <input
              type="text"
              value={country}
              onChange={(e) => setCountry(e.target.value)}
              placeholder="например, Франция"
            />
          </FormField>
          <FormField label="Город / регион" hint="Необязательно">
            <input type="text" value={city} onChange={(e) => setCity(e.target.value)} />
          </FormField>
        </>
      ) : null}

      {step === 1 ? (
        <>
          <div className="cols2">
            <FormField label="Дата начала">
              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
              />
            </FormField>
            <FormField label="Дата окончания">
              <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
            </FormField>
          </div>
          {duration !== null && duration > 0 ? (
            <p className="hint">Продолжительность: {duration} дн.</p>
          ) : null}
        </>
      ) : null}

      {step === 2 ? (
        <div className="field">
          <span className="lbl">Цель поездки (можно несколько)</span>
          <div className="chips">
            {tripPurpose.options.map((v) => (
              <button
                key={v}
                type="button"
                className={`chip${purposes.includes(v) ? ' is-active' : ''}`}
                aria-pressed={purposes.includes(v)}
                onClick={() => setPurposes((p) => toggle(p, v))}
              >
                {TRIP_PURPOSE_LABELS[v]}
              </button>
            ))}
          </div>
        </div>
      ) : null}

      {step === 3 ? (
        <div className="field">
          <span className="lbl">Транспорт (можно несколько)</span>
          <div className="chips">
            {tripTransport.options.map((v) => (
              <button
                key={v}
                type="button"
                className={`chip${transport.includes(v) ? ' is-active' : ''}`}
                aria-pressed={transport.includes(v)}
                onClick={() => setTransport((t) => toggle(t, v))}
              >
                {TRIP_TRANSPORT_LABELS[v]}
              </button>
            ))}
          </div>
        </div>
      ) : null}

      {step === 4 ? (
        <>
          <div className="field" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <Checkbox
              checked={conditions.canLaundry}
              onChange={() => setConditions((c) => ({ ...c, canLaundry: !c.canLaundry }))}
              label="Будет возможность стирать вещи"
            />
            <Checkbox
              checked={conditions.needsLaptop}
              onChange={() => setConditions((c) => ({ ...c, needsLaptop: !c.needsLaptop }))}
              label="Нужен ноутбук / работа"
            />
            <Checkbox
              checked={conditions.seaOrPool}
              onChange={() => setConditions((c) => ({ ...c, seaOrPool: !c.seaOrPool }))}
              label="Море или бассейн"
            />
            <Checkbox
              checked={conditions.activeOutdoor}
              onChange={() => setConditions((c) => ({ ...c, activeOutdoor: !c.activeOutdoor }))}
              label="Активный отдых / походы"
            />
            <Checkbox
              checked={conditions.specialEvent}
              onChange={() => setConditions((c) => ({ ...c, specialEvent: !c.specialEvent }))}
              label="Особое событие"
            />
          </div>
          <FormField label="Комментарий" hint="Необязательно">
            <textarea
              rows={2}
              value={conditions.comment ?? ''}
              onChange={(e) => setConditions((c) => ({ ...c, comment: e.target.value || null }))}
            />
          </FormField>
        </>
      ) : null}
    </Modal>
  );
}
