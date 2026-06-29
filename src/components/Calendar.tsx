import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
} from 'react';
import { createClient } from '@supabase/supabase-js';
import {
  addDays,
  addMonths,
  eachDayOfInterval,
  endOfMonth,
  endOfWeek,
  format,
  isSameDay,
  parseISO,
  startOfMonth,
  startOfWeek,
  subMonths,
} from 'date-fns';
import { es } from 'date-fns/locale';
import {
  AlertCircle,
  Calendar as CalendarIcon,
  Check,
  ChevronLeft,
  ChevronRight,
  Copy,
  Crown,
  Download,
  Heart,
  HelpCircle,
  Link as LinkIcon,
  Lock,
  MapPin,
  MessageCircle,
  Plus,
  Save,
  Sparkles,
  Star,
  Trash2,
  Unlock,
  UserRound,
  Vote,
  Wallet,
  X,
} from 'lucide-react';

const supabase = createClient(
  import.meta.env.PUBLIC_SUPABASE_URL,
  import.meta.env.PUBLIC_SUPABASE_ANON_KEY,
);

type AvailabilityStatus =
  | 'preferred'
  | 'available'
  | 'maybe'
  | 'unavailable';

type Availability = {
  id: string | number;
  group_uuid: string;
  participant_id: string | null;
  user_name: string;
  date: string;
  status: AvailabilityStatus;
};

type Participant = {
  id: string;
  group_uuid: string;
  display_name: string;
};

type Identity = {
  participantId: string;
  name: string;
  token: string;
};

type Preference = {
  participant_id: string;
  group_uuid: string;
  preferred_max_days: number | null;
  budget_eur: number | null;
  origin: string | null;
  notes: string | null;
};

type Proposal = {
  id: string;
  group_uuid: string;
  title: string;
  start_date: string;
  end_date: string;
  note: string | null;
  created_at: string;
  vote_count: number | string;
};

type ProposalVote = {
  proposal_id: string;
  participant_id: string;
};

const statusOptions: Array<{
  value: AvailabilityStatus;
  label: string;
  shortLabel: string;
  icon: typeof Check;
  buttonClass: string;
  badgeClass: string;
}> = [
  {
    value: 'preferred',
    label: 'Ideal',
    shortLabel: 'Ideal',
    icon: Star,
    buttonClass: 'border-indigo-300 bg-indigo-50 text-indigo-800',
    badgeClass: 'bg-indigo-600 text-white',
  },
  {
    value: 'available',
    label: 'Puedo',
    shortLabel: 'Sí',
    icon: Check,
    buttonClass: 'border-emerald-300 bg-emerald-50 text-emerald-800',
    badgeClass: 'bg-emerald-500 text-white',
  },
  {
    value: 'maybe',
    label: 'Quizá',
    shortLabel: 'Quizá',
    icon: HelpCircle,
    buttonClass: 'border-amber-300 bg-amber-50 text-amber-800',
    badgeClass: 'bg-amber-400 text-amber-950',
  },
  {
    value: 'unavailable',
    label: 'No puedo',
    shortLabel: 'No',
    icon: X,
    buttonClass: 'border-rose-300 bg-rose-50 text-rose-800',
    badgeClass: 'bg-rose-500 text-white',
  },
];

const storageKey = (groupId: string) => `almanaque-identity-${groupId}`;

const getInitials = (name: string) =>
  name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join('');

const getErrorMessage = (error: unknown) => {
  if (error instanceof Error) return error.message;
  if (typeof error === 'object' && error && 'message' in error) {
    return String(error.message);
  }
  return 'Ha ocurrido un error inesperado.';
};

export default function Calendar({ groupId }: { groupId: string }) {
  const [groupName, setGroupName] = useState('');
  const [groupError, setGroupError] = useState('');
  const [availability, setAvailability] = useState<Availability[]>([]);
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [preferences, setPreferences] = useState<Preference[]>([]);
  const [proposals, setProposals] = useState<Proposal[]>([]);
  const [proposalVotes, setProposalVotes] = useState<ProposalVote[]>([]);
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [adminToken, setAdminToken] = useState('');
  const [isAdmin, setIsAdmin] = useState(false);
  const [finalizedProposalId, setFinalizedProposalId] = useState<string | null>(
    null,
  );
  const [identity, setIdentity] = useState<Identity | null>(null);
  const [nameInput, setNameInput] = useState('');
  const [preferredMaxDays, setPreferredMaxDays] = useState('');
  const [budgetEur, setBudgetEur] = useState('');
  const [origin, setOrigin] = useState('');
  const [preferenceNotes, setPreferenceNotes] = useState('');
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [selectedStatus, setSelectedStatus] =
    useState<AvailabilityStatus>('available');
  const [rangeStart, setRangeStart] = useState('');
  const [rangeEnd, setRangeEnd] = useState('');
  const [tripLength, setTripLength] = useState(5);
  const [proposalTitle, setProposalTitle] = useState('');
  const [proposalNote, setProposalNote] = useState('');
  const proposalTitleRef = useRef<HTMLInputElement>(null);
  const proposalStartRef = useRef<HTMLInputElement>(null);
  const proposalEndRef = useRef<HTMLInputElement>(null);
  const proposalNoteRef = useRef<HTMLInputElement>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [message, setMessage] = useState('');

  const fetchAvailability = async (token = accessToken ?? '') => {
    const { data, error } = await supabase.rpc(
      'get_planning_availability',
      {
        p_group_uuid: groupId,
        p_access_token: token,
      },
    );

    if (error) throw error;
    setAvailability((data ?? []) as Availability[]);
  };

  const fetchParticipants = async (token = accessToken ?? '') => {
    const { data, error } = await supabase.rpc('get_planning_participants', {
      p_group_uuid: groupId,
      p_access_token: token,
    });

    if (error) throw error;
    setParticipants((data ?? []) as Participant[]);
  };

  const fetchPreferences = async (token = accessToken ?? '') => {
    const { data, error } = await supabase.rpc('get_planning_preferences', {
      p_group_uuid: groupId,
      p_access_token: token,
    });

    if (error) throw error;
    setPreferences((data ?? []) as Preference[]);
  };

  const fetchProposals = async (token = accessToken ?? '') => {
    const [{ data: proposalData, error: proposalError }, { data: voteData, error: voteError }] =
      await Promise.all([
        supabase.rpc('get_planning_proposals', {
          p_group_uuid: groupId,
          p_access_token: token,
        }),
        supabase.rpc('get_planning_votes', {
          p_group_uuid: groupId,
          p_access_token: token,
        }),
      ]);

    if (proposalError) throw proposalError;
    if (voteError) throw voteError;
    setProposals((proposalData ?? []) as Proposal[]);
    setProposalVotes((voteData ?? []) as ProposalVote[]);
  };

  const fetchGroupMeta = async (token = accessToken ?? '') => {
    const { data, error } = await supabase.rpc('get_planning_group', {
      p_group_uuid: groupId,
      p_access_token: token,
    });

    if (error || !data?.[0]) throw error ?? new Error('Grupo no disponible');
    setGroupName(data[0].name);
    setFinalizedProposalId(data[0].finalized_proposal_id ?? null);
    return data[0];
  };

  useEffect(() => {
    const hashToken = new URLSearchParams(
      window.location.hash.replace(/^#/, ''),
    ).get('key');
    const savedToken = window.localStorage.getItem(
      `almanaque-access-${groupId}`,
    );
    const token = hashToken ?? savedToken ?? '';

    if (hashToken) {
      window.localStorage.setItem(`almanaque-access-${groupId}`, hashToken);
    }
    setAccessToken(token);
  }, [groupId]);

  useEffect(() => {
    if (!identity) return;
    const ownPreferences = preferences.find(
      (preference) => preference.participant_id === identity.participantId,
    );
    setPreferredMaxDays(
      ownPreferences?.preferred_max_days?.toString() ?? '',
    );
    setBudgetEur(ownPreferences?.budget_eur?.toString() ?? '');
    setOrigin(ownPreferences?.origin ?? '');
    setPreferenceNotes(ownPreferences?.notes ?? '');
  }, [identity, preferences]);

  useEffect(() => {
    const hashAdminToken = new URLSearchParams(
      window.location.hash.replace(/^#/, ''),
    ).get('admin');
    const savedAdminToken =
      hashAdminToken ??
      window.localStorage.getItem(`almanaque-admin-${groupId}`) ??
      '';
    if (hashAdminToken) {
      window.localStorage.setItem(
        `almanaque-admin-${groupId}`,
        hashAdminToken,
      );
    }
    setAdminToken(savedAdminToken);

    if (!savedAdminToken) {
      setIsAdmin(false);
      return;
    }

    void supabase
      .rpc('is_planning_admin', {
        p_group_uuid: groupId,
        p_admin_token: savedAdminToken,
      })
      .then(({ data, error }) => setIsAdmin(!error && data === true));
  }, [groupId]);

  useEffect(() => {
    if (accessToken === null) return;
    let isActive = true;

    const loadGroup = async () => {
      setIsLoading(true);
      setGroupError('');

      try {
        await fetchGroupMeta(accessToken);
      } catch {
        if (!isActive) return;
        setGroupError(
          'Este grupo no existe o la clave del enlace de invitación no es válida.',
        );
        setIsLoading(false);
        return;
      }

      try {
        await Promise.all([
          fetchAvailability(accessToken),
          fetchParticipants(accessToken),
          fetchPreferences(accessToken),
          fetchProposals(accessToken),
        ]);
      } catch (loadError) {
        setGroupError(
          `No se pudieron cargar los datos. ${getErrorMessage(loadError)}`,
        );
      } finally {
        if (isActive) setIsLoading(false);
      }
    };

    void loadGroup();

    const refreshInterval = window.setInterval(() => {
      void Promise.all([
        fetchGroupMeta(accessToken),
        fetchAvailability(accessToken),
        fetchParticipants(accessToken),
        fetchPreferences(accessToken),
        fetchProposals(accessToken),
      ]).catch(() => undefined);
    }, 15_000);

    return () => {
      isActive = false;
      window.clearInterval(refreshInterval);
    };
  }, [accessToken, groupId]);

  useEffect(() => {
    const savedIdentity = window.localStorage.getItem(storageKey(groupId));
    if (!savedIdentity) return;

    try {
      const parsed = JSON.parse(savedIdentity) as Identity;
      if (parsed.participantId && parsed.name && parsed.token) {
        setIdentity(parsed);
        setNameInput(parsed.name);
      }
    } catch {
      window.localStorage.removeItem(storageKey(groupId));
    }
  }, [groupId]);

  const monthStart = startOfMonth(currentMonth);
  const monthEnd = endOfMonth(monthStart);
  const calendarStart = startOfWeek(monthStart, { weekStartsOn: 1 });
  const calendarEnd = endOfWeek(monthEnd, { weekStartsOn: 1 });
  const calendarDays = eachDayOfInterval({
    start: calendarStart,
    end: calendarEnd,
  });

  const entriesByDate = useMemo(() => {
    const result = new Map<string, Availability[]>();
    for (const entry of availability) {
      const entries = result.get(entry.date) ?? [];
      entries.push(entry);
      result.set(entry.date, entries);
    }
    return result;
  }, [availability]);

  const bestWindows = useMemo(() => {
    const candidates = [];
    const lastStart = addDays(monthEnd, -(tripLength - 1));

    for (
      let start = monthStart;
      start <= lastStart;
      start = addDays(start, 1)
    ) {
      const days = eachDayOfInterval({
        start,
        end: addDays(start, tripLength - 1),
      });

      const availableEveryDay = participants.filter((participant) =>
        days.every((day) =>
          (entriesByDate.get(format(day, 'yyyy-MM-dd')) ?? []).some(
            (entry) =>
              entry.participant_id === participant.id &&
              (entry.status === 'available' ||
                entry.status === 'preferred'),
          ),
        ),
      );

      if (availableEveryDay.length > 0) {
        const preferenceScore = days.reduce(
          (score, day) =>
            score +
            (entriesByDate.get(format(day, 'yyyy-MM-dd')) ?? []).filter(
              (entry) => entry.status === 'preferred',
            ).length,
          0,
        );
        candidates.push({
          start,
          end: days.at(-1) ?? start,
          participants: availableEveryDay,
          preferenceScore,
        });
      }
    }

    return candidates
      .sort(
        (a, b) =>
          b.participants.length - a.participants.length ||
          b.preferenceScore - a.preferenceScore ||
          a.start.getTime() - b.start.getTime(),
      )
      .slice(0, 3);
  }, [entriesByDate, monthEnd, monthStart, participants, tripLength]);

  const participantResponses = useMemo(
    () =>
      participants.map((participant) => ({
        ...participant,
        hasResponded: availability.some(
          (entry) => entry.participant_id === participant.id,
        ),
      })),
    [availability, participants],
  );

  const finalizedProposal =
    proposals.find((proposal) => proposal.id === finalizedProposalId) ?? null;

  const preferenceSummary = useMemo(() => {
    const budgets = preferences
      .map((preference) => preference.budget_eur)
      .filter((budget): budget is number => budget !== null);
    const maxDays = preferences
      .map((preference) => preference.preferred_max_days)
      .filter((days): days is number => days !== null);
    const origins = Array.from(
      new Set(
        preferences
          .map((preference) => preference.origin)
          .filter((value): value is string => Boolean(value)),
      ),
    );

    return {
      averageBudget:
        budgets.length > 0
          ? Math.round(
              budgets.reduce((total, budget) => total + budget, 0) /
                budgets.length,
            )
          : null,
      shortestTrip: maxDays.length > 0 ? Math.min(...maxDays) : null,
      origins,
    };
  }, [preferences]);

  const saveIdentity = async () => {
    const normalizedName = nameInput.trim().replace(/\s+/g, ' ');
    if (!normalizedName) {
      setMessage('Escribe tu nombre para continuar.');
      return;
    }

    setIsSaving(true);
    setMessage('');
    const token = identity?.token ?? crypto.randomUUID();

    const { data, error } = await supabase.rpc('join_planning_group', {
      p_group_uuid: groupId,
      p_display_name: normalizedName,
      p_edit_token: token,
      p_access_token: accessToken ?? '',
    });

    if (error || !data?.[0]) {
      setMessage(
        `No se pudo guardar tu identidad. ${getErrorMessage(error)}`,
      );
      setIsSaving(false);
      return;
    }

    const nextIdentity = {
      participantId: data[0].id as string,
      name: data[0].display_name as string,
      token,
    };

    setIdentity(nextIdentity);
    setNameInput(nextIdentity.name);
    window.localStorage.setItem(
      storageKey(groupId),
      JSON.stringify(nextIdentity),
    );
    await fetchParticipants().catch(() => undefined);
    setMessage('Tu identidad está guardada en este dispositivo.');
    setIsSaving(false);
  };

  const savePreferences = async () => {
    if (!identity) {
      setMessage('Guarda primero tu identidad.');
      return;
    }

    setIsSaving(true);
    setMessage('');
    const { error } = await supabase.rpc('set_planning_preferences', {
      p_group_uuid: groupId,
      p_participant_id: identity.participantId,
      p_edit_token: identity.token,
      p_access_token: accessToken ?? '',
      p_preferred_max_days: preferredMaxDays
        ? Number(preferredMaxDays)
        : null,
      p_budget_eur: budgetEur ? Number(budgetEur) : null,
      p_origin: origin,
      p_notes: preferenceNotes,
    });

    if (error) {
      setMessage(
        `No se pudieron guardar tus preferencias. ${getErrorMessage(error)}`,
      );
    } else {
      await fetchPreferences().catch(() => undefined);
      setMessage('Preferencias guardadas.');
    }
    setIsSaving(false);
  };

  const createProposal = async (
    title = proposalTitle,
    start = '',
    end = '',
    note = proposalNote,
  ) => {
    if (!isAdmin || !adminToken) {
      setMessage('Solo el administrador puede crear propuestas.');
      return;
    }
    if (!title.trim() || !start || !end || end < start) {
      setMessage('Completa correctamente la propuesta.');
      return;
    }

    setIsSaving(true);
    setMessage('');
    const { error } = await supabase.rpc('create_planning_proposal', {
      p_group_uuid: groupId,
      p_admin_token: adminToken,
      p_title: title.trim(),
      p_start_date: start,
      p_end_date: end,
      p_note: note.trim(),
    });

    if (error) {
      setMessage(`No se pudo crear la propuesta. ${getErrorMessage(error)}`);
    } else {
      setProposalTitle('');
      setProposalNote('');
      await fetchProposals().catch(() => undefined);
      setMessage('Propuesta creada. Ya podéis votar.');
    }
    setIsSaving(false);
  };

  const submitProposal = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    void createProposal(
      proposalTitleRef.current?.value ?? '',
      proposalStartRef.current?.value ?? '',
      proposalEndRef.current?.value ?? '',
      proposalNoteRef.current?.value ?? '',
    );
  };

  const toggleVote = async (proposalId: string) => {
    if (!identity) {
      setMessage('Guarda primero tu identidad para votar.');
      return;
    }
    if (finalizedProposalId) {
      setMessage('La votación ya está cerrada.');
      return;
    }

    setIsSaving(true);
    const { error } = await supabase.rpc('toggle_planning_vote', {
      p_group_uuid: groupId,
      p_participant_id: identity.participantId,
      p_edit_token: identity.token,
      p_access_token: accessToken ?? '',
      p_proposal_id: proposalId,
    });

    if (error) {
      setMessage(`No se pudo guardar el voto. ${getErrorMessage(error)}`);
    } else {
      await fetchProposals().catch(() => undefined);
      setMessage('Voto actualizado.');
    }
    setIsSaving(false);
  };

  const deleteProposal = async (proposalId: string) => {
    if (!isAdmin || !adminToken) return;
    setIsSaving(true);
    const { error } = await supabase.rpc('delete_planning_proposal', {
      p_group_uuid: groupId,
      p_admin_token: adminToken,
      p_proposal_id: proposalId,
    });

    if (error) {
      setMessage(`No se pudo eliminar la propuesta. ${getErrorMessage(error)}`);
    } else {
      await fetchProposals().catch(() => undefined);
      setMessage('Propuesta eliminada.');
    }
    setIsSaving(false);
  };

  const finalizeProposal = async (proposalId: string) => {
    if (!isAdmin || !adminToken) return;
    setIsSaving(true);
    const { error } = await supabase.rpc('finalize_planning_proposal', {
      p_group_uuid: groupId,
      p_admin_token: adminToken,
      p_proposal_id: proposalId,
    });

    if (error) {
      setMessage(`No se pudo cerrar la votación. ${getErrorMessage(error)}`);
    } else {
      await fetchGroupMeta().catch(() => undefined);
      setMessage('Fecha final confirmada. El calendario queda bloqueado.');
    }
    setIsSaving(false);
  };

  const reopenVote = async () => {
    if (!isAdmin || !adminToken) return;
    setIsSaving(true);
    const { error } = await supabase.rpc('reopen_planning_vote', {
      p_group_uuid: groupId,
      p_admin_token: adminToken,
    });

    if (error) {
      setMessage(`No se pudo reabrir la votación. ${getErrorMessage(error)}`);
    } else {
      await fetchGroupMeta().catch(() => undefined);
      setMessage('Votación reabierta.');
    }
    setIsSaving(false);
  };

  const setDateAvailability = async (date: Date) => {
    if (finalizedProposalId) {
      setMessage('El viaje ya tiene una fecha final.');
      return;
    }
    if (!identity || isSaving) {
      setMessage('Guarda primero tu identidad.');
      return;
    }

    const dateString = format(date, 'yyyy-MM-dd');
    const previous = availability;
    const existing = previous.find(
      (entry) =>
        entry.date === dateString &&
        entry.participant_id === identity.participantId,
    );
    const nextStatus =
      existing?.status === selectedStatus ? null : selectedStatus;

    setMessage('');
    setIsSaving(true);
    setAvailability((current) => {
      const withoutCurrent = current.filter(
        (entry) =>
          !(
            entry.date === dateString &&
            entry.participant_id === identity.participantId
          ),
      );

      if (!nextStatus) return withoutCurrent;

      return [
        ...withoutCurrent,
        {
          id: `pending-${dateString}`,
          group_uuid: groupId,
          participant_id: identity.participantId,
          user_name: identity.name,
          date: dateString,
          status: nextStatus,
        },
      ];
    });

    const { error } = await supabase.rpc('set_planning_availability', {
      p_group_uuid: groupId,
      p_participant_id: identity.participantId,
      p_edit_token: identity.token,
      p_access_token: accessToken ?? '',
      p_date: dateString,
      p_status: nextStatus,
    });

    if (error) {
      setAvailability(previous);
      setMessage(`No se pudo guardar el día. ${getErrorMessage(error)}`);
    } else {
      await fetchAvailability().catch(() => undefined);
    }
    setIsSaving(false);
  };

  const applyRange = async () => {
    if (finalizedProposalId) {
      setMessage('El viaje ya tiene una fecha final.');
      return;
    }
    if (!identity) {
      setMessage('Guarda primero tu identidad.');
      return;
    }
    if (!rangeStart || !rangeEnd || rangeEnd < rangeStart) {
      setMessage('Selecciona un rango de fechas válido.');
      return;
    }

    setIsSaving(true);
    setMessage('');
    const { error } = await supabase.rpc(
      'set_planning_availability_range',
      {
        p_group_uuid: groupId,
        p_participant_id: identity.participantId,
        p_edit_token: identity.token,
        p_access_token: accessToken ?? '',
        p_start_date: rangeStart,
        p_end_date: rangeEnd,
        p_status: selectedStatus,
      },
    );

    if (error) {
      setMessage(`No se pudo guardar el rango. ${getErrorMessage(error)}`);
    } else {
      setCurrentMonth(parseISO(rangeStart));
      setMessage('Rango actualizado.');
      await fetchAvailability().catch(() => undefined);
    }
    setIsSaving(false);
  };

  const copyLink = async () => {
    try {
      const inviteUrl = new URL(window.location.href);
      inviteUrl.hash = accessToken ? `key=${encodeURIComponent(accessToken)}` : '';
      await navigator.clipboard.writeText(inviteUrl.toString());
      setMessage('Enlace de invitación copiado.');
    } catch {
      setMessage('No se pudo copiar el enlace automáticamente.');
    }
  };

  const copyReminder = async () => {
    const pending = participantResponses
      .filter((participant) => !participant.hasResponded)
      .map((participant) => participant.display_name);
    const inviteUrl = new URL(window.location.href);
    inviteUrl.hash = accessToken ? `key=${encodeURIComponent(accessToken)}` : '';
    const pendingText =
      pending.length > 0
        ? `Faltan por responder: ${pending.join(', ')}.`
        : 'Todo el mundo ha marcado ya sus fechas.';
    const text = `Estamos cuadrando ${groupName}. ${pendingText}\n${inviteUrl.toString()}`;

    try {
      await navigator.clipboard.writeText(text);
      setMessage('Recordatorio copiado para compartir por WhatsApp.');
    } catch {
      setMessage('No se pudo copiar el recordatorio.');
    }
  };

  const copyAdminLink = async () => {
    if (!isAdmin || !adminToken) return;
    const adminUrl = new URL(window.location.href);
    const hash = new URLSearchParams();
    if (accessToken) hash.set('key', accessToken);
    hash.set('admin', adminToken);
    adminUrl.hash = hash.toString();

    try {
      await navigator.clipboard.writeText(adminUrl.toString());
      setMessage(
        'Enlace de administrador copiado. Guárdalo en un lugar seguro.',
      );
    } catch {
      setMessage('No se pudo copiar el enlace de administrador.');
    }
  };

  const downloadCalendar = (start: Date, end: Date) => {
    const escapeIcsText = (value: string) =>
      value.replace(/\\/g, '\\\\').replace(/,/g, '\\,').replace(/;/g, '\\;');
    const content = [
      'BEGIN:VCALENDAR',
      'VERSION:2.0',
      'PRODID:-//Almanaque//Planificador de vacaciones//ES',
      'CALSCALE:GREGORIAN',
      'BEGIN:VEVENT',
      `UID:${groupId}-${format(start, 'yyyyMMdd')}@almanaque`,
      `DTSTAMP:${new Date()
        .toISOString()
        .replace(/[-:]/g, '')
        .replace(/\.\d{3}Z$/, 'Z')}`,
      `DTSTART;VALUE=DATE:${format(start, 'yyyyMMdd')}`,
      `DTEND;VALUE=DATE:${format(addDays(end, 1), 'yyyyMMdd')}`,
      `SUMMARY:${escapeIcsText(groupName)}`,
      'DESCRIPTION:Fecha propuesta desde Almanaque',
      'END:VEVENT',
      'END:VCALENDAR',
    ].join('\r\n');
    const url = URL.createObjectURL(
      new Blob([content], { type: 'text/calendar;charset=utf-8' }),
    );
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `${groupName.toLowerCase().replace(/[^a-z0-9]+/g, '-') || 'viaje'}.ics`;
    anchor.click();
    URL.revokeObjectURL(url);
  };

  if (isLoading) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center text-slate-500">
        Cargando grupo...
      </div>
    );
  }

  if (groupError) {
    return (
      <section className="mx-auto max-w-xl rounded-3xl border border-rose-200 bg-white p-8 text-center shadow-xl">
        <AlertCircle className="mx-auto mb-4 text-rose-500" size={40} />
        <h1 className="text-2xl font-black text-slate-900">
          No encontramos este grupo
        </h1>
        <p className="mt-3 text-slate-600">{groupError}</p>
        <a
          href="/"
          className="mt-6 inline-flex rounded-xl bg-blue-600 px-5 py-3 font-bold text-white"
        >
          Crear un grupo nuevo
        </a>
      </section>
    );
  }

  return (
    <div className="mx-auto max-w-6xl">
      <header className="mb-8 flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div>
          <div className="mb-2 flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-blue-600">
            <CalendarIcon size={14} aria-hidden="true" />
            Planificador de grupo
          </div>
          <h1 className="text-3xl font-black text-slate-900 sm:text-4xl">
            {groupName}
          </h1>
          <p className="mt-2 text-sm text-slate-500">
            Cualquiera con este enlace puede ver el grupo.
          </p>
          {isAdmin && (
            <span className="mt-3 inline-flex items-center gap-1.5 rounded-full bg-amber-100 px-3 py-1 text-xs font-black text-amber-900">
              <Crown size={14} aria-hidden="true" />
              Administrador
            </span>
          )}
        </div>
        <div className="flex flex-col gap-2 sm:flex-row">
          <button
            type="button"
            onClick={copyLink}
            className="flex items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-3 font-medium text-slate-700 shadow-sm hover:bg-slate-50"
          >
            <Copy size={18} aria-hidden="true" />
            Copiar invitación
          </button>
          {isAdmin && (
            <button
              type="button"
              onClick={copyAdminLink}
              className="flex items-center justify-center gap-2 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 font-medium text-amber-900"
            >
              <Crown size={18} aria-hidden="true" />
              Enlace administrador
            </button>
          )}
        </div>
      </header>

      {message && (
        <div
          role="status"
          className="mb-5 rounded-xl border border-blue-100 bg-blue-50 px-4 py-3 text-sm text-blue-900"
        >
          {message}
        </div>
      )}

      {finalizedProposal && (
        <section className="mb-6 rounded-3xl border border-emerald-200 bg-emerald-50 p-5 sm:p-6">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <div className="flex items-center gap-2 text-emerald-800">
                <Lock size={20} aria-hidden="true" />
                <h2 className="font-black">Fecha final confirmada</h2>
              </div>
              <p className="mt-2 text-xl font-black text-emerald-950">
                {format(parseISO(finalizedProposal.start_date), 'd MMMM', {
                  locale: es,
                })}{' '}
                -{' '}
                {format(parseISO(finalizedProposal.end_date), 'd MMMM yyyy', {
                  locale: es,
                })}
              </p>
              <p className="mt-1 text-sm text-emerald-800">
                {finalizedProposal.title}
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() =>
                  downloadCalendar(
                    parseISO(finalizedProposal.start_date),
                    parseISO(finalizedProposal.end_date),
                  )
                }
                className="flex items-center gap-2 rounded-xl bg-emerald-700 px-4 py-3 text-sm font-bold text-white"
              >
                <Download size={17} aria-hidden="true" />
                Calendario definitivo
              </button>
              {isAdmin && (
                <button
                  type="button"
                  onClick={() => void reopenVote()}
                  disabled={isSaving}
                  className="flex items-center gap-2 rounded-xl border border-emerald-300 bg-white px-4 py-3 text-sm font-bold text-emerald-800"
                >
                  <Unlock size={17} aria-hidden="true" />
                  Reabrir
                </button>
              )}
            </div>
          </div>
        </section>
      )}

      <div className="mb-6 grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
        <section className="rounded-3xl border border-slate-100 bg-white p-5 shadow-lg shadow-slate-200/40 sm:p-6">
          <div className="mb-4 flex items-center gap-2">
            <UserRound size={20} className="text-blue-600" aria-hidden="true" />
            <h2 className="font-black text-slate-900">Tu identidad</h2>
          </div>
          <div className="flex flex-col gap-3 sm:flex-row">
            <label className="flex-1">
              <span className="sr-only">Tu nombre</span>
              <input
                className="w-full rounded-xl border-2 border-slate-200 px-4 py-3 outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10"
                placeholder="Tu nombre"
                maxLength={40}
                value={nameInput}
                onChange={(event) => setNameInput(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') void saveIdentity();
                }}
              />
            </label>
            <button
              type="button"
              onClick={() => void saveIdentity()}
              disabled={isSaving}
              className="flex items-center justify-center gap-2 rounded-xl bg-blue-600 px-5 py-3 font-bold text-white disabled:opacity-50"
            >
              <Save size={18} aria-hidden="true" />
              {identity ? 'Actualizar' : 'Guardar'}
            </button>
          </div>
          <p className="mt-3 text-xs text-slate-500">
            Solo este dispositivo podrá editar tus fechas. No compartimos tu
            clave de edición.
          </p>
        </section>

        <section className="rounded-3xl border border-slate-100 bg-white p-5 shadow-lg shadow-slate-200/40 sm:p-6">
          <h2 className="mb-4 font-black text-slate-900">
            ¿Qué quieres marcar?
          </h2>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {statusOptions.map((option) => {
              const Icon = option.icon;
              const isSelected = selectedStatus === option.value;
              return (
                <button
                  type="button"
                  key={option.value}
                  aria-pressed={isSelected}
                  onClick={() => setSelectedStatus(option.value)}
                  disabled={Boolean(finalizedProposalId)}
                  className={`flex items-center justify-center gap-1 rounded-xl border-2 px-2 py-3 text-sm font-bold transition ${
                    isSelected
                      ? option.buttonClass
                      : 'border-slate-100 text-slate-500 hover:border-slate-200'
                  } disabled:cursor-not-allowed disabled:opacity-50`}
                >
                  <Icon size={17} aria-hidden="true" />
                  {option.label}
                </button>
              );
            })}
          </div>
        </section>
      </div>

      <section className="mb-6 rounded-3xl border border-slate-100 bg-white p-5 shadow-lg shadow-slate-200/40 sm:p-6">
        <div className="mb-4 flex items-center gap-2">
          <Heart size={20} className="text-rose-500" aria-hidden="true" />
          <h2 className="font-black text-slate-900">Tus preferencias</h2>
        </div>
        <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-4">
          <label className="text-sm font-bold text-slate-600">
            Máximo de días
            <input
              type="number"
              min="1"
              max="60"
              value={preferredMaxDays}
              onChange={(event) => setPreferredMaxDays(event.target.value)}
              placeholder="Ej: 7"
              className="mt-1 block w-full rounded-xl border-2 border-slate-200 px-3 py-2.5 font-normal"
            />
          </label>
          <label className="text-sm font-bold text-slate-600">
            Presupuesto aproximado
            <div className="relative mt-1">
              <Wallet
                size={16}
                className="absolute left-3 top-3 text-slate-400"
                aria-hidden="true"
              />
              <input
                type="number"
                min="0"
                max="100000"
                value={budgetEur}
                onChange={(event) => setBudgetEur(event.target.value)}
                placeholder="Ej: 1200"
                className="block w-full rounded-xl border-2 border-slate-200 py-2.5 pl-9 pr-3 font-normal"
              />
            </div>
          </label>
          <label className="text-sm font-bold text-slate-600">
            Salida desde
            <div className="relative mt-1">
              <MapPin
                size={16}
                className="absolute left-3 top-3 text-slate-400"
                aria-hidden="true"
              />
              <input
                maxLength={80}
                value={origin}
                onChange={(event) => setOrigin(event.target.value)}
                placeholder="Madrid, Bilbao..."
                className="block w-full rounded-xl border-2 border-slate-200 py-2.5 pl-9 pr-3 font-normal"
              />
            </div>
          </label>
          <label className="text-sm font-bold text-slate-600">
            Notas
            <input
              maxLength={300}
              value={preferenceNotes}
              onChange={(event) => setPreferenceNotes(event.target.value)}
              placeholder="Sin escalas, playa..."
              className="mt-1 block w-full rounded-xl border-2 border-slate-200 px-3 py-2.5 font-normal"
            />
          </label>
        </div>
        <button
          type="button"
          onClick={() => void savePreferences()}
          disabled={isSaving}
          className="mt-4 rounded-xl bg-rose-600 px-5 py-3 text-sm font-bold text-white disabled:opacity-50"
        >
          Guardar preferencias
        </button>
      </section>

      <section className="mb-6 rounded-3xl border border-slate-100 bg-white p-5 shadow-lg shadow-slate-200/40 sm:p-6">
        <div className="mb-4 flex items-center gap-2">
          <LinkIcon size={19} className="text-blue-600" aria-hidden="true" />
          <h2 className="font-black text-slate-900">Marcar un rango</h2>
        </div>
        <div className="grid gap-3 sm:grid-cols-[1fr_1fr_auto]">
          <label className="text-sm font-bold text-slate-600">
            Desde
            <input
              type="date"
              disabled={Boolean(finalizedProposalId)}
              value={rangeStart}
              onChange={(event) => setRangeStart(event.target.value)}
              className="mt-1 block w-full rounded-xl border-2 border-slate-200 px-3 py-2.5 font-normal"
            />
          </label>
          <label className="text-sm font-bold text-slate-600">
            Hasta
            <input
              type="date"
              disabled={Boolean(finalizedProposalId)}
              value={rangeEnd}
              min={rangeStart}
              onChange={(event) => setRangeEnd(event.target.value)}
              className="mt-1 block w-full rounded-xl border-2 border-slate-200 px-3 py-2.5 font-normal"
            />
          </label>
          <button
            type="button"
            onClick={() => void applyRange()}
            disabled={isSaving || Boolean(finalizedProposalId)}
            className="self-end rounded-xl bg-slate-900 px-5 py-3 font-bold text-white disabled:opacity-50"
          >
            Aplicar estado
          </button>
        </div>
      </section>

      <section className="mb-6 rounded-3xl border border-indigo-100 bg-gradient-to-br from-indigo-50 to-white p-5 sm:p-6">
        <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="flex items-center gap-2">
              <Sparkles
                size={20}
                className="text-indigo-600"
                aria-hidden="true"
              />
              <h2 className="font-black text-slate-900">Mejores fechas</h2>
            </div>
            <p className="mt-1 text-sm text-slate-600">
              Personas disponibles todos los días del viaje.
            </p>
          </div>
          <label className="text-sm font-bold text-slate-700">
            Duración
            <select
              value={tripLength}
              onChange={(event) => setTripLength(Number(event.target.value))}
              className="ml-2 rounded-lg border border-indigo-200 bg-white px-3 py-2"
            >
              {[3, 5, 7, 10, 14].map((days) => (
                <option key={days} value={days}>
                  {days} días
                </option>
              ))}
            </select>
          </label>
        </div>
        {bestWindows.length > 0 ? (
          <div className="grid gap-3 md:grid-cols-3">
            {bestWindows.map((window) => (
              <article
                key={window.start.toISOString()}
                className="rounded-2xl border border-indigo-100 bg-white p-4"
              >
                <p className="font-black text-indigo-900">
                  {format(window.start, 'd MMM', { locale: es })} -{' '}
                  {format(window.end, 'd MMM', { locale: es })}
                </p>
                <p className="mt-1 text-sm text-slate-600">
                  {window.participants.length} de {participants.length}{' '}
                  disponibles
                </p>
                {window.preferenceScore > 0 && (
                  <p className="mt-1 text-xs font-bold text-indigo-600">
                    {window.preferenceScore} marca
                    {window.preferenceScore === 1 ? '' : 's'} como ideal
                  </p>
                )}
                <p className="mt-2 truncate text-xs text-slate-500">
                  {window.participants
                    .map((participant) => participant.display_name)
                    .join(', ')}
                </p>
                <div className="mt-3 flex flex-wrap gap-3">
                  <button
                    type="button"
                    onClick={() => downloadCalendar(window.start, window.end)}
                    className="flex items-center gap-1.5 text-xs font-bold text-indigo-700 hover:text-indigo-900"
                  >
                    <Download size={14} aria-hidden="true" />
                    Calendario
                  </button>
                  {isAdmin && !finalizedProposalId && (
                    <button
                      type="button"
                      onClick={() =>
                        void createProposal(
                          `${format(window.start, 'd MMM', {
                            locale: es,
                          })} - ${format(window.end, 'd MMM', {
                            locale: es,
                          })}`,
                          format(window.start, 'yyyy-MM-dd'),
                          format(window.end, 'yyyy-MM-dd'),
                          `${window.participants.length} personas disponibles todos los días`,
                        )
                      }
                      className="flex items-center gap-1.5 text-xs font-bold text-indigo-700 hover:text-indigo-900"
                    >
                      <Plus size={14} aria-hidden="true" />
                      Proponer
                    </button>
                  )}
                </div>
              </article>
            ))}
          </div>
        ) : (
          <p className="rounded-xl bg-white/70 p-4 text-sm text-slate-600">
            Aún no hay una ventana completa de {tripLength} días. Seguid
            marcando fechas.
          </p>
        )}
      </section>

      <section className="mb-6 rounded-3xl border border-violet-100 bg-white p-5 shadow-lg shadow-slate-200/40 sm:p-6">
        <div className="mb-5 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="flex items-center gap-2">
              <Vote size={20} className="text-violet-600" aria-hidden="true" />
              <h2 className="font-black text-slate-900">
                Propuestas y votación
              </h2>
            </div>
            <p className="mt-1 text-sm text-slate-500">
              Podéis votar más de una opción.
            </p>
          </div>
          {finalizedProposalId && (
            <span className="rounded-full bg-emerald-100 px-3 py-1 text-xs font-black text-emerald-800">
              Votación cerrada
            </span>
          )}
        </div>

        {isAdmin && !finalizedProposalId && (
          <form
            onSubmit={submitProposal}
            className="mb-6 rounded-2xl bg-violet-50 p-4"
          >
            <p className="mb-3 text-sm font-black text-violet-900">
              Nueva propuesta manual
            </p>
            <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-4">
              <input
                ref={proposalTitleRef}
                name="title"
                maxLength={80}
                value={proposalTitle}
                onChange={(event) => setProposalTitle(event.target.value)}
                placeholder="Título de la opción"
                aria-label="Título de la propuesta"
                className="rounded-xl border border-violet-200 bg-white px-3 py-2.5"
              />
              <input
                ref={proposalStartRef}
                name="start"
                type="date"
                aria-label="Inicio de la propuesta"
                className="rounded-xl border border-violet-200 bg-white px-3 py-2.5"
              />
              <input
                ref={proposalEndRef}
                name="end"
                type="date"
                aria-label="Fin de la propuesta"
                className="rounded-xl border border-violet-200 bg-white px-3 py-2.5"
              />
              <input
                ref={proposalNoteRef}
                name="note"
                maxLength={300}
                value={proposalNote}
                onChange={(event) => setProposalNote(event.target.value)}
                placeholder="Comentario opcional"
                aria-label="Comentario de la propuesta"
                className="rounded-xl border border-violet-200 bg-white px-3 py-2.5"
              />
            </div>
            <button
              type="submit"
              disabled={isSaving}
              className="mt-3 flex items-center gap-2 rounded-xl bg-violet-700 px-4 py-2.5 text-sm font-bold text-white disabled:opacity-50"
            >
              <Plus size={17} aria-hidden="true" />
              Crear propuesta
            </button>
          </form>
        )}

        {proposals.length > 0 ? (
          <div className="grid gap-4 lg:grid-cols-2">
            {proposals.map((proposal) => {
              const votes = proposalVotes.filter(
                (vote) => vote.proposal_id === proposal.id,
              );
              const hasMyVote = votes.some(
                (vote) => vote.participant_id === identity?.participantId,
              );
              const voterNames = votes
                .map(
                  (vote) =>
                    participants.find(
                      (participant) => participant.id === vote.participant_id,
                    )?.display_name,
                )
                .filter((name): name is string => Boolean(name));
              const isFinal = finalizedProposalId === proposal.id;

              return (
                <article
                  key={proposal.id}
                  className={`rounded-2xl border p-4 ${
                    isFinal
                      ? 'border-emerald-300 bg-emerald-50'
                      : 'border-slate-200'
                  }`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <h3 className="font-black text-slate-900">
                        {proposal.title}
                      </h3>
                      <p className="mt-1 text-sm font-bold text-violet-700">
                        {format(parseISO(proposal.start_date), 'd MMM', {
                          locale: es,
                        })}{' '}
                        -{' '}
                        {format(parseISO(proposal.end_date), 'd MMM yyyy', {
                          locale: es,
                        })}
                      </p>
                    </div>
                    <span className="rounded-full bg-violet-100 px-3 py-1 text-xs font-black text-violet-800">
                      {Number(proposal.vote_count)} voto
                      {Number(proposal.vote_count) === 1 ? '' : 's'}
                    </span>
                  </div>
                  {proposal.note && (
                    <p className="mt-3 text-sm text-slate-600">
                      {proposal.note}
                    </p>
                  )}
                  <p className="mt-2 min-h-5 text-xs text-slate-400">
                    {voterNames.length > 0
                      ? voterNames.join(', ')
                      : 'Aún no hay votos'}
                  </p>
                  <div className="mt-4 flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => void toggleVote(proposal.id)}
                      disabled={isSaving || Boolean(finalizedProposalId)}
                      className={`rounded-xl px-4 py-2 text-sm font-bold disabled:opacity-50 ${
                        hasMyVote
                          ? 'bg-violet-700 text-white'
                          : 'border border-violet-200 text-violet-700'
                      }`}
                    >
                      {hasMyVote ? 'Quitar mi voto' : 'Votar esta opción'}
                    </button>
                    {isAdmin && !finalizedProposalId && (
                      <>
                        <button
                          type="button"
                          onClick={() => void finalizeProposal(proposal.id)}
                          disabled={isSaving}
                          className="flex items-center gap-1.5 rounded-xl bg-emerald-700 px-4 py-2 text-sm font-bold text-white disabled:opacity-50"
                        >
                          <Lock size={15} aria-hidden="true" />
                          Elegir como final
                        </button>
                        <button
                          type="button"
                          aria-label={`Eliminar ${proposal.title}`}
                          onClick={() => void deleteProposal(proposal.id)}
                          disabled={isSaving}
                          className="rounded-xl border border-rose-200 p-2 text-rose-600 disabled:opacity-50"
                        >
                          <Trash2 size={17} aria-hidden="true" />
                        </button>
                      </>
                    )}
                  </div>
                </article>
              );
            })}
          </div>
        ) : (
          <p className="rounded-xl bg-slate-50 p-4 text-sm text-slate-500">
            Todavía no hay propuestas. El administrador puede convertir una de
            las mejores fechas en opción votable.
          </p>
        )}
      </section>

      {participantResponses.length > 0 && (
        <section className="mb-6 rounded-3xl border border-slate-100 bg-white p-5 shadow-lg shadow-slate-200/40 sm:p-6">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <h2 className="font-black text-slate-900">Participación</h2>
              <p className="mt-1 text-sm text-slate-500">
                {
                  participantResponses.filter(
                    (participant) => participant.hasResponded,
                  ).length
                }{' '}
                de {participantResponses.length} personas han marcado fechas.
              </p>
            </div>
            <button
              type="button"
              onClick={copyReminder}
              className="flex items-center justify-center gap-2 rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-bold text-slate-700"
            >
              <MessageCircle size={17} aria-hidden="true" />
              Copiar recordatorio
            </button>
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
            {participantResponses.map((participant) => (
              <span
                key={participant.id}
                className={`rounded-full px-3 py-1.5 text-xs font-bold ${
                  participant.hasResponded
                    ? 'bg-emerald-100 text-emerald-800'
                    : 'bg-slate-100 text-slate-500'
                }`}
              >
                {participant.display_name}
                {participant.hasResponded ? ' · listo' : ' · pendiente'}
              </span>
            ))}
          </div>
          {(preferenceSummary.averageBudget ||
            preferenceSummary.shortestTrip ||
            preferenceSummary.origins.length > 0) && (
            <div className="mt-5 grid gap-3 rounded-2xl bg-slate-50 p-4 sm:grid-cols-3">
              <div>
                <p className="text-xs font-bold uppercase text-slate-400">
                  Presupuesto medio
                </p>
                <p className="mt-1 font-black text-slate-800">
                  {preferenceSummary.averageBudget
                    ? `${preferenceSummary.averageBudget} €`
                    : 'Sin datos'}
                </p>
              </div>
              <div>
                <p className="text-xs font-bold uppercase text-slate-400">
                  Duración compatible
                </p>
                <p className="mt-1 font-black text-slate-800">
                  {preferenceSummary.shortestTrip
                    ? `Hasta ${preferenceSummary.shortestTrip} días`
                    : 'Sin datos'}
                </p>
              </div>
              <div>
                <p className="text-xs font-bold uppercase text-slate-400">
                  Salidas
                </p>
                <p className="mt-1 truncate font-black text-slate-800">
                  {preferenceSummary.origins.join(', ') || 'Sin datos'}
                </p>
              </div>
            </div>
          )}
        </section>
      )}

      <section className="overflow-hidden rounded-3xl border border-slate-100 bg-white shadow-2xl shadow-slate-200/60">
        <div className="flex items-center justify-between gap-4 border-b border-slate-100 bg-slate-50/70 p-4 sm:p-6">
          <div>
            <h2 className="text-xl font-black capitalize text-slate-800 sm:text-2xl">
              {format(currentMonth, 'MMMM yyyy', { locale: es })}
            </h2>
            <p className="mt-1 text-xs text-slate-500">
              {participants.length} participante
              {participants.length === 1 ? '' : 's'}
            </p>
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              aria-label="Mes anterior"
              onClick={() => setCurrentMonth(subMonths(currentMonth, 1))}
              className="rounded-xl border border-slate-200 bg-white p-3 text-slate-600 hover:bg-slate-50"
            >
              <ChevronLeft aria-hidden="true" />
            </button>
            <button
              type="button"
              aria-label="Mes siguiente"
              onClick={() => setCurrentMonth(addMonths(currentMonth, 1))}
              className="rounded-xl border border-slate-200 bg-white p-3 text-slate-600 hover:bg-slate-50"
            >
              <ChevronRight aria-hidden="true" />
            </button>
          </div>
        </div>

        <div className="grid grid-cols-7 gap-px bg-slate-200">
          {['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'].map((day) => (
            <div
              key={day}
              className="bg-white px-0.5 py-2 text-center text-[9px] font-black uppercase tracking-wide text-slate-400 sm:p-4 sm:text-xs sm:tracking-widest"
            >
              {day}
            </div>
          ))}

          {calendarDays.map((day) => {
            const dateString = format(day, 'yyyy-MM-dd');
            const dayEntries = entriesByDate.get(dateString) ?? [];
            const myEntry = dayEntries.find(
              (entry) => entry.participant_id === identity?.participantId,
            );
            const isCurrentMonth =
              startOfMonth(day).getTime() === monthStart.getTime();
            const statusConfig = statusOptions.find(
              (option) => option.value === myEntry?.status,
            );

            return (
              <button
                type="button"
                key={dateString}
                onClick={() => void setDateAvailability(day)}
                disabled={Boolean(finalizedProposalId)}
                aria-label={`${format(day, "d 'de' MMMM", {
                  locale: es,
                })}. ${
                  myEntry
                    ? `Tu estado: ${statusConfig?.label}`
                    : 'Sin estado personal'
                }`}
                className={`relative min-h-20 overflow-hidden p-1 text-left transition disabled:cursor-not-allowed sm:min-h-32 sm:p-3 ${
                  isCurrentMonth
                    ? 'bg-white hover:bg-slate-50'
                    : 'bg-slate-50 text-slate-300'
                } ${myEntry ? 'ring-2 ring-inset ring-blue-200' : ''}`}
              >
                <span
                  className={`flex h-6 w-6 items-center justify-center rounded-full text-[11px] font-bold sm:h-7 sm:w-7 sm:text-sm ${
                    isSameDay(day, new Date())
                      ? 'bg-blue-600 text-white'
                      : 'text-slate-700'
                  }`}
                >
                  {format(day, 'd')}
                </span>
                <div className="mt-1 flex flex-wrap gap-0.5 sm:mt-1.5 sm:flex-col sm:gap-1">
                  {dayEntries.slice(0, 5).map((entry, index) => {
                    const config =
                      statusOptions.find(
                        (option) => option.value === entry.status,
                      ) ?? statusOptions[0];
                    return (
                      <span
                        key={entry.id}
                        title={`${entry.user_name}: ${config.label}`}
                        className={`h-4 min-w-4 items-center justify-center rounded-full px-0.5 text-[8px] font-black sm:h-auto sm:justify-start sm:rounded-lg sm:px-2 sm:py-1 sm:text-[10px] ${
                          index >= 3 ? 'hidden sm:flex' : 'flex'
                        } ${config.badgeClass}`}
                      >
                        <span className="sm:hidden">
                          {getInitials(entry.user_name)}
                        </span>
                        <span className="hidden truncate sm:inline">
                          {entry.user_name} · {config.shortLabel}
                        </span>
                      </span>
                    );
                  })}
                  {dayEntries.length > 3 && (
                    <span className="flex h-4 min-w-4 items-center justify-center rounded-full bg-slate-100 px-0.5 text-[8px] font-black text-slate-500 sm:hidden">
                      +{dayEntries.length - 3}
                    </span>
                  )}
                  {dayEntries.length > 5 && (
                    <span className="hidden text-[9px] font-bold text-slate-500 sm:inline">
                      +{dayEntries.length - 5}
                    </span>
                  )}
                </div>
              </button>
            );
          })}
        </div>
      </section>

      <p className="mt-4 text-center text-xs text-slate-400">
        Pulsa de nuevo un día con el mismo estado para dejarlo sin marcar.
      </p>
    </div>
  );
}
