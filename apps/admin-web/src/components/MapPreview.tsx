import { importLibrary, setOptions } from "@googlemaps/js-api-loader";
import { useEffect, useRef, useState } from "react";
import { MUNICIPALITY } from "../master/index.ts";

/** 小諸市付近（デモ自治体のデフォルト中心） */
const DEFAULT_CENTER = { lat: 36.327, lng: 138.426 } as const;

const mapsApiKey = import.meta.env.VITE_GOOGLE_MAPS_API_KEY;

if (mapsApiKey) {
  setOptions({ key: mapsApiKey, v: "weekly", language: "ja", region: "JP" });
}

type Props = {
  lat?: number;
  lon?: number;
  onLocationSelect?: (lat: number, lon: number) => void;
  className?: string;
};

function isValidCoord(lat?: number, lon?: number): lat is number {
  return (
    lat != null &&
    lon != null &&
    Number.isFinite(lat) &&
    Number.isFinite(lon) &&
    lat >= -90 &&
    lat <= 90 &&
    lon >= -180 &&
    lon <= 180
  );
}

export function MapPreview({ lat, lon, onLocationSelect, className = "" }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<google.maps.Map | null>(null);
  const markerRef = useRef<google.maps.Marker | null>(null);
  const onLocationSelectRef = useRef(onLocationSelect);
  onLocationSelectRef.current = onLocationSelect;
  const [mapReady, setMapReady] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(() =>
    mapsApiKey ? null : "VITE_GOOGLE_MAPS_API_KEY が未設定です",
  );
  const hasLocation = isValidCoord(lat, lon);

  useEffect(() => {
    if (!mapsApiKey || !containerRef.current || mapRef.current) return;

    let cancelled = false;

    void importLibrary("maps")
      .then(({ Map: GoogleMap }) => {
        if (cancelled || !containerRef.current) return;

        const map = new GoogleMap(containerRef.current, {
          center: DEFAULT_CENTER,
          zoom: 13,
          mapTypeControl: false,
          streetViewControl: false,
          fullscreenControl: false,
          scrollwheel: false,
        });

        map.addListener("click", (event: google.maps.MapMouseEvent) => {
          const position = event.latLng;
          if (!position) return;
          onLocationSelectRef.current?.(
            Number(position.lat().toFixed(6)),
            Number(position.lng().toFixed(6)),
          );
        });

        mapRef.current = map;
        setMapReady(true);
      })
      .catch(() => {
        if (!cancelled) setLoadError("Google Maps の読み込みに失敗しました");
      });

    return () => {
      cancelled = true;
      markerRef.current?.setMap(null);
      markerRef.current = null;
      mapRef.current = null;
      setMapReady(false);
    };
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!mapReady || !map) return;

    if (!hasLocation || lat == null || lon == null) {
      markerRef.current?.setMap(null);
      markerRef.current = null;
      map.setCenter(DEFAULT_CENTER);
      map.setZoom(13);
      return;
    }

    const position = { lat, lng: lon };
    map.setCenter(position);
    map.setZoom(15);

    if (markerRef.current) {
      markerRef.current.setPosition(position);
      markerRef.current.setMap(map);
    } else {
      markerRef.current = new google.maps.Marker({ map, position });
    }
  }, [mapReady, hasLocation, lat, lon]);

  return (
    <div className={`relative overflow-hidden rounded-lg border border-[#e2e8f0] ${className}`}>
      <div ref={containerRef} className="h-[220px] w-full bg-[#e2e8f0]" />
      {loadError && (
        <div className="absolute inset-0 flex items-center justify-center bg-[#f1f6fb] p-4 text-center text-xs text-[#64748b]">
          {loadError}
          <br />
          Maps JavaScript API を有効化し、apps/admin-web/.env にキーを設定してください。
        </div>
      )}
      {!loadError && !hasLocation && (
        <div className="pointer-events-none absolute inset-0 flex items-end justify-center bg-linear-to-t from-white/90 to-transparent p-4">
          <p className="text-center text-xs text-[#64748b]">
            住所を入力すると {MUNICIPALITY.name} 周辺の Google マップにピンが表示されます。
            <br />
            地図をクリックして座標を指定することもできます。
          </p>
        </div>
      )}
      {!loadError && hasLocation && onLocationSelect && (
        <p className="border-t border-[#e2e8f0] bg-[#f1f6fb] px-3 py-2 text-xs text-[#64748b]">
          地図をクリックすると緯度・経度を更新できます。
        </p>
      )}
    </div>
  );
}
