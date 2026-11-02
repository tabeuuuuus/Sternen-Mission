-- Sternen-Mission: sicherer Lesebericht für Lehrpersonen.
-- Nur Testdaten verwenden, bis die Schule den Einsatz freigegeben hat.
-- Idempotent: kann erneut ausgeführt werden.
create or replace function public.sm_teacher_report()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  result jsonb;
begin
  if auth.uid() is null or not exists (
    select 1 from public.sm_teachers t where t.user_id = auth.uid()
  ) then
    raise exception 'Not authorized' using errcode = '42501';
  end if;

  select jsonb_build_object(
    'students', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', s.id, 'nickname', s.nickname,
        'level', coalesce(p.current_level,1),
        'coins', coalesce(p.coins,0)
      ) order by s.nickname)
      from public.sm_students s
      left join public.sm_progress p on p.student_id=s.id
      where s.teacher_id=auth.uid()
    ), '[]'::jsonb),
    'statistics', coalesce((
      select jsonb_agg(jsonb_build_object(
        'student_id', x.student_id,
        'factor', x.factor_a,
        'attempts', x.attempts,
        'correct', x.correct,
        'average_ms', x.avg_ms
      ) order by x.student_id, x.factor_a)
      from (
        select a.student_id,a.factor_a,count(*) as attempts,
          count(*) filter (where a.correct) as correct,
          round(avg(a.response_ms)) as avg_ms
        from public.sm_answers a
        join public.sm_students s on s.id=a.student_id
        where s.teacher_id=auth.uid()
        group by a.student_id,a.factor_a
      ) x
    ), '[]'::jsonb),
    'difficult', coalesce((
      select jsonb_agg(jsonb_build_object(
        'student_id', x.student_id, 'a',x.factor_a,'b',x.factor_b,
        'attempts',x.attempts,'errors',x.errors,'average_ms',x.avg_ms
      ) order by x.errors desc, x.attempts desc)
      from (
        select a.student_id,a.factor_a,a.factor_b,count(*) as attempts,
          count(*) filter (where not a.correct) as errors,
          round(avg(a.response_ms)) as avg_ms
        from public.sm_answers a
        join public.sm_students s on s.id=a.student_id
        where s.teacher_id=auth.uid()
        group by a.student_id,a.factor_a,a.factor_b
        having count(*) filter (where not a.correct)>0
      ) x
    ), '[]'::jsonb)
  ) into result;
  return result;
end;
$$;

revoke all on function public.sm_teacher_report() from public, anon;
grant execute on function public.sm_teacher_report() to authenticated;
