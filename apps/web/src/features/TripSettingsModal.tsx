import { useEffect, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Button, Checkbox, FormField, Modal, useToast } from '@planner/ui';
import {
  TRIP_PURPOSE_LABELS,
  TRIP_TRANSPORT_LABELS,
  tripPurpose,
  tripTransport,
  type Trip,
  type TripConditions,
  type TripPurpose,
  type TripTransport,
} from '@planner/contracts';
import { api } from '../api/client.js';
import { qk } from '../api/queries.js';

/**
 * Правка параметров уже созданной поездки — те же поля, что в визарде
 * создания, но без шагов: сюда возвращаются нечасто, обычно один раз.
 * Чек-лист при сохранении не трогается — за это отвечает отдельная кнопка
 * «Обновить рекомендации» на экране поездки.
 */
export function TripSettingsModal({
  trip,
  open,
  onOpenChange,
}: {
  trip: Trip;
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const qc = useQueryClient();
  const toast = useToast();
  const [name, setName] = useState(trip.name ?? '');
  const [country, setCountry] = useState(trip.country);
  const [city, setCity] = useState(trip.city ?? '');
  const [startDate, setStartDate] = useState(trip.startDate);
  const [endDate, setEndDate] = useState(trip.endDate);
  const [purposes, setPurposes] = useState<TripPurpose[]>(trip.purposes);
  const [transport, setTransport] = useState<TripTransport[]>(trip.transport);
  const [conditions, setConditions] = useState<TripConditions>(trip.conditions);

  useEffect(() => {
    if (!open) return;
    setName(trip.name ?? '');
    setCountry(trip.country);
    setCity(trip.city ?? '');
    setStartDate(trip.startDate);
    setEndDate(trip.endDate);
    setPurposes(trip.purposes);
    setTransport(trip.transport);
    setConditions(trip.conditions);
  }, [open, trip]);

  const toggle = <T,>(list: T[], value: T): T[] =>
    list.includes(value) ? list.filter((v) => v !== value) : [...list, value];

  const save = useMutation({
    mutationFn: () =>
      api.travel.updateTrip(trip.id, {
        name: name.trim() || null,
        country: country.trim(),
        city: city.trim() || null,
        startDate,
        endDate,
        purposes,
        transport,
        conditions,
      }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: qk.trip(trip.id) });
      void qc.invalidateQueries({ queryKey: qk.trips });
      toast.show('Параметры поездки сохранены');
      onOpenChange(false);
    },
    onError: () => toast.show('Не удалось сохранить параметры поездки'),
  });

  return (
    <Modal
      open={open}
      onOpenChange={onOpenChange}
      title="Параметры поездки"
      description="Чек-лист не изменится — новые пункты можно добавить кнопкой «Обновить рекомендации»."
      footer={
        <>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Отмена
          </Button>
          <Button
            variant="primary"
            disabled={!country.trim() || !startDate || !endDate}
            onClick={() => save.mutate()}
          >
            Сохранить
          </Button>
        </>
      }
    >
      <FormField label="Название" hint="Необязательно">
        <input type="text" value={name} onChange={(e) => setName(e.target.value)} />
      </FormField>
      <div className="cols2">
        <FormField label="Страна">
          <input type="text" value={country} onChange={(e) => setCountry(e.target.value)} />
        </FormField>
        <FormField label="Город / регион" hint="Необязательно">
          <input type="text" value={city} onChange={(e) => setCity(e.target.value)} />
        </FormField>
      </div>
      <div className="cols2">
        <FormField label="Дата начала">
          <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
        </FormField>
        <FormField label="Дата окончания">
          <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
        </FormField>
      </div>

      <div className="field">
        <span className="lbl">Цель поездки</span>
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

      <div className="field">
        <span className="lbl">Транспорт</span>
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

      <div className="field" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        <span className="lbl">Условия</span>
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
    </Modal>
  );
}
