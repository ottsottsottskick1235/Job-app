'use client';

import { FormEvent, useState } from 'react';

export default function EmployerPage() {
  const [employerResult, setEmployerResult] = useState('');
  const [jobResult, setJobResult] = useState('');

  async function createEmployer(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const response = await fetch('/api/employers', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        companyName: form.get('companyName'),
        email: form.get('email'),
        latitude: Number(form.get('latitude')),
        longitude: Number(form.get('longitude')),
      }),
    });
    setEmployerResult(JSON.stringify(await response.json(), null, 2));
  }

  async function createJob(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const response = await fetch('/api/jobs', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        employerId: form.get('employerId'),
        title: form.get('title'),
        category: form.get('category'),
        hourlyRate: Number(form.get('hourlyRate')),
        weeklyHours: form.get('weeklyHours') ? Number(form.get('weeklyHours')) : null,
        minExperienceMonths: Number(form.get('minExperienceMonths')),
        latitude: Number(form.get('latitude')),
        longitude: Number(form.get('longitude')),
        startDate: form.get('startDate') || null,
        requiredCertifications: String(form.get('requiredCertifications') || '').split(',').map((v) => v.trim()).filter(Boolean),
        shifts: [{
          weekday: Number(form.get('weekday')),
          startTime: form.get('startTime'),
          endTime: form.get('endTime'),
        }],
      }),
    });
    setJobResult(JSON.stringify(await response.json(), null, 2));
  }

  return (
    <main>
      <h1>Employer</h1>
      <h2>Create employer</h2>
      <form onSubmit={createEmployer}>
        <p><label>Company name <input name="companyName" required /></label></p>
        <p><label>Email <input name="email" type="email" required /></label></p>
        <p><label>Latitude <input name="latitude" type="number" step="any" required /></label></p>
        <p><label>Longitude <input name="longitude" type="number" step="any" required /></label></p>
        <button type="submit">Create employer</button>
      </form>
      <pre>{employerResult}</pre>

      <h2>Create job</h2>
      <form onSubmit={createJob}>
        <p><label>Employer ID <input name="employerId" required /></label></p>
        <p><label>Job title <input name="title" required /></label></p>
        <p><label>Category <input name="category" placeholder="lifeguard" required /></label></p>
        <p><label>Hourly rate <input name="hourlyRate" type="number" step="0.01" required /></label></p>
        <p><label>Weekly hours <input name="weeklyHours" type="number" /></label></p>
        <p><label>Minimum experience months <input name="minExperienceMonths" type="number" defaultValue="0" required /></label></p>
        <p><label>Latitude <input name="latitude" type="number" step="any" required /></label></p>
        <p><label>Longitude <input name="longitude" type="number" step="any" required /></label></p>
        <p><label>Start date <input name="startDate" type="date" /></label></p>
        <p><label>Required certifications, comma-separated <input name="requiredCertifications" placeholder="NLS Pool, Standard First Aid" /></label></p>
        <fieldset>
          <legend>One required shift for MVP</legend>
          <p><label>Weekday (0 Sunday to 6 Saturday) <input name="weekday" type="number" min="0" max="6" required /></label></p>
          <p><label>Start time <input name="startTime" type="time" required /></label></p>
          <p><label>End time <input name="endTime" type="time" required /></label></p>
        </fieldset>
        <button type="submit">Create job</button>
      </form>
      <pre>{jobResult}</pre>
    </main>
  );
}
