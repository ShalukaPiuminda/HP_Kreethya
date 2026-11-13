'use client';

import { useEffect, useRef, useState } from 'react';
import type { Map as LeafletMap, CircleMarker } from 'leaflet';
import 'leaflet/dist/leaflet.css';

export function CustomerLocationInput({ values, onChange }: {
  values: Record<string, string>;
  onChange: (values: Record<string, string>) => void;
}) {
  const container = useRef<HTMLDivElement>(null);
  const map = useRef<LeafletMap | null>(null);
  const marker = useRef<CircleMarker | null>(null);
  const latest = useRef({ values, onChange });
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const hasPin = values.latitude !== '' && values.longitude !== '' && Number.isFinite(Number(values.latitude)) && Number.isFinite(Number(values.longitude));

  useEffect(() => { latest.current = { values, onChange }; }, [values, onChange]);

  useEffect(() => {
    if (!open || !container.current) return;
    let disposed = false;
    void import('leaflet').then((L) => {
      if (disposed || !container.current) return;
      const current = latest.current.values;
      const initial: [number, number] = current.latitude && current.longitude
        ? [Number(current.latitude), Number(current.longitude)] : [7.8731, 80.7718];
      const instance = L.map(container.current).setView(initial, current.latitude ? 16 : 7);
      map.current = instance;
      L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
        maxZoom: 19,
      }).addTo(instance).on('tileerror', () => {
        if (!disposed) setError('Map tiles could not load. Check your connection, or enter coordinates below.');
      });
      marker.current = L.circleMarker(initial, { radius: 9, color: '#4338ca', fillOpacity: 0.85 });
      if (current.latitude && current.longitude) marker.current.addTo(instance);
      instance.on('click', (event) => {
        const { values: next, onChange: change } = latest.current;
        change({ ...next, latitude: event.latlng.lat.toFixed(7), longitude: event.latlng.lng.toFixed(7) });
      });
    }).catch(() => { if (!disposed) setError('Map could not load. You can still enter coordinates below.'); });
    return () => {
      disposed = true;
      map.current?.remove();
      map.current = null;
      marker.current = null;
    };
  }, [open]);

  useEffect(() => {
    if (!map.current || !marker.current) return;
    if (!hasPin) { marker.current.remove(); return; }
    const point: [number, number] = [Number(values.latitude), Number(values.longitude)];
    if (Math.abs(point[0]) > 90 || Math.abs(point[1]) > 180) return;
    marker.current.setLatLng(point).addTo(map.current);
    map.current.panTo(point);
  }, [hasPin, values.latitude, values.longitude, open]);

  function locate() {
    if (!navigator.geolocation) { setError('This browser does not support location access.'); return; }
    setBusy(true);
    setError('');
    navigator.geolocation.getCurrentPosition((position) => {
      const { values: current, onChange: change } = latest.current;
      change({ ...current, latitude: position.coords.latitude.toFixed(7), longitude: position.coords.longitude.toFixed(7) });
      setOpen(true);
      setBusy(false);
      setError(`Device accuracy: approximately ${Math.round(position.coords.accuracy)} metres. Check the pin before saving.`);
    }, (failure) => {
      setBusy(false);
      setError(failure.code === 1 ? 'Location permission was denied. Choose a pin on the map instead.' : 'Unable to obtain your location. Check device location settings or choose a pin.');
    }, { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 });
  }

  const button = 'rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-700 disabled:opacity-50';
  return <section className="space-y-3 rounded-xl border border-slate-200 bg-slate-50 p-4">
    <div><h3 className="font-semibold text-slate-900">Customer location <span className="text-xs font-normal text-slate-500">Optional</span></h3>
      <p className="mt-1 text-xs text-slate-600">Place a pin at the house or accessible entrance for deliveries and collection visits. Saved when you save the customer.</p></div>
    <label className="block text-sm font-medium text-slate-700">Landmark / directions
      <textarea value={values.location_note} onChange={(event) => onChange({ ...values, location_note: event.target.value })} maxLength={500} placeholder="Blue gate opposite the temple" rows={2} className="mt-1 w-full rounded-lg border border-slate-300 bg-white p-2" />
    </label>
    <div className="flex flex-wrap gap-2">
      <button type="button" className={button} onClick={() => setOpen(!open)}>{open ? 'Hide map' : 'Choose on map'}</button>
      <button type="button" className={button} onClick={locate} disabled={busy}>{busy ? 'Finding location…' : 'Use current location'}</button>
      {hasPin && <><a className={button} href={`https://www.google.com/maps/dir/?api=1&destination=${values.latitude},${values.longitude}`} target="_blank" rel="noopener noreferrer">Directions ↗</a>
        <button type="button" className={button} onClick={() => onChange({ ...values, latitude: '', longitude: '' })}>Remove pin</button></>}
    </div>
    <p className="text-xs text-slate-500">Use current location only when you are at the customer’s premises. Pan and zoom the map, then click to select or move the pin.</p>
    {open && <div ref={container} className="relative z-0 h-72 overflow-hidden rounded-lg border border-slate-300" aria-label="Customer location map" />}
    <div className="grid grid-cols-2 gap-3">
      <label className="text-xs font-medium text-slate-600">Latitude<input type="number" min={-90} max={90} step="any" value={values.latitude} onChange={(event) => onChange({ ...values, latitude: event.target.value })} placeholder="6.9271" className="mt-1 w-full rounded-lg border border-slate-300 p-2 text-sm" /></label>
      <label className="text-xs font-medium text-slate-600">Longitude<input type="number" min={-180} max={180} step="any" value={values.longitude} onChange={(event) => onChange({ ...values, longitude: event.target.value })} placeholder="79.8612" className="mt-1 w-full rounded-lg border border-slate-300 p-2 text-sm" /></label>
    </div>
    {error && <p role="status" className="text-xs text-amber-800">{error}</p>}
  </section>;
}
