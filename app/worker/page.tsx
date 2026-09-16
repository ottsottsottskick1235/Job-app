'use client';

import { FormEvent, useState } from 'react';

export default function WorkerPage() {
  const [result, setResult] = useState('');

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const payload = {
      fullName: form.get('fullName'),
      email: form.get('email'),
      preferredRoles: String(form.get('preferredRoles') || '').split(',').map((v) => v.trim()).filter(Boolean),
      minHourlyRate: Number(form.get('minHourlyRate')),
      maxTravelKm: Number(form.get('maxTravelKm')),
      minWeeklyHours: form.get('minWeeklyHours') ? Number(form.get('minWeeklyHours')) : null,
      maxWeeklyHours: form.get('maxWeeklyHours') ? Number(form.get('maxWeeklyHours')) : null,
      experienceMonths: Number(form.get('experienceMonths')),
      latitude: Number(form.get('latitude')),
      longitude: Number(form.get('longitude')),
      certifications: String(form.get('certifications') || '').split(',').map((name) => ({ name: name.trim() })).filter((c) => c.name),
      availability: [
        {
          weekday: Number(form.get('weekday')),
          startTime: form.get('startTime'),
          endTime: form.get('endTime'),
        },
      ],
    };

    const response = await fetch('/api/workers', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const data = await response.json();
    setResult(JSON.stringify(data, null, 2));
  }

  return (
    <main>
      <h1>Create worker</h1>
      <form onSubmit={submit}>
        <p><label>Name <input name="fullName" required /></label></p>
        <p><label>Email <input name="email" type="email" required /></label></p>
        <p><label>Preferred roles, comma-separated <input name="preferredRoles" placeholder="lifeguard, swim instructor" required /></label></p>
        <p><label>Minimum hourly rate <input name="minHourlyRate" type="number" step="0.01" defaultValue="20" required /></label></p>
        <p><label>Maximum travel distance (km) <input name="maxTravelKm" type="number" step="0.1" defaultValue="20" required /></label></p>
        <p><label>Minimum weekly hours <input name="minWeeklyHours" type="number" /></label></p>
        <p><label>Maximum weekly hours <input name="maxWeeklyHours" type="number" /></label></p>
        <p><label>Experience (months) <input name="experienceMonths" type="number" defaultValue="0" required /></label></p>
        <p><label>Latitude <input name="latitude" type="number" step="any" required /></label></p>
        <p><label>Longitude <input name="longitude" type="number" step="any" required /></label></p>
        <p><label>Certifications, comma-separated <input name="certifications" placeholder="NLS Pool, Standard First Aid" /></label></p>
        <fieldset>
          <legend>One availability block for MVP</legend>
          <p><label>Weekday (0 Sunday to 6 Saturday) <input name="weekday" type="number" min="0" max="6" required /></label></p>
          <p><label>Start time <input name="startTime" type="time" required /></label></p>
          <p><label>End time <input name="endTime" type="time" required /></label></p>
        </fieldset>
        <button type="submit">Create worker</button>
      </form>
      <pre>{result}</pre>
    </main>
  );
}
