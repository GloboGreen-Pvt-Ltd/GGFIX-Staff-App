import React, { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Linking, Platform, UIManager, View } from 'react-native';
import Constants from 'expo-constants';
import * as Location from 'expo-location';
import { MapPin, Navigation, Phone, Store } from 'lucide-react-native';
import { Text } from '../../components/Typography';
import { Button, SK } from './deliveryKit';

// Delivery Task, map first: Google map (shop + customer markers) on top and a
// rounded panel with pickup / delivery locations and actions below.
// Coordinates come from the order's own addresses via the device geocoder —
// nothing is invented; if an address cannot be resolved its marker is skipped.
// Distance / ETA are not shown: no routes service is wired for this app yet,
// and Navigate opens Google Maps for the real route.

let Maps = null;
try { Maps = require('react-native-maps'); } catch (_) { Maps = null; }
const HAS_MAP = Platform.OS === 'android'
  && !!Constants.expoConfig?.android?.config?.googleMaps?.apiKey
  && !!Maps && !!UIManager.hasViewManagerConfig?.('AIRMap');
const MUTED = '#606E87';

async function geocode(address) {
  if (!address) return null;
  try {
    const [r] = await Location.geocodeAsync(address);
    return r ? { latitude: r.latitude, longitude: r.longitude } : null;
  } catch (_) { return null; }
}

const directions = (from, to) => Linking.openURL(
  `https://www.google.com/maps/dir/?api=1${from ? `&origin=${encodeURIComponent(from)}` : ''}&destination=${encodeURIComponent(to)}&travelmode=driving`,
).catch(() => {});

export default function DeliveryRouteMap({ o, onStartJourney, journeyStarted }) {
  const [pts, setPts] = useState(null); // { shop, customer }
  const mapRef = useRef(null);
  useEffect(() => {
    let alive = true;
    Promise.all([geocode(o.shopAddress), geocode(o.deliveryAddress)])
      .then(([shop, customer]) => { if (alive) setPts({ shop, customer }); });
    return () => { alive = false; };
  }, [o.shopAddress, o.deliveryAddress]);

  const coords = pts ? [pts.shop, pts.customer].filter(Boolean) : [];
  useEffect(() => {
    if (coords.length > 1) setTimeout(() => mapRef.current?.fitToCoordinates?.(coords, { edgePadding: { top: 40, right: 40, bottom: 40, left: 40 }, animated: true }), 300);
  }, [pts]); // eslint-disable-line react-hooks/exhaustive-deps

  const row = (Icon, title, name, address) => (
    <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 8, marginTop: 10 }}>
      <View style={{ height: 30, width: 30, borderRadius: 15, backgroundColor: SK.tealSoft, alignItems: 'center', justifyContent: 'center' }}>
        <Icon size={15} color={SK.teal} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={{ fontSize: 11, fontWeight: '800', color: MUTED }}>{title}</Text>
        {name ? <Text style={{ fontSize: 13.5, fontWeight: '800', color: SK.ink }}>{name}</Text> : null}
        <Text style={{ fontSize: 12.5, color: SK.ink }}>{address || '—'}</Text>
      </View>
    </View>
  );

  return (
    <View style={{ marginTop: 10, borderRadius: 18, overflow: 'hidden', borderWidth: 1, borderColor: SK.line, backgroundColor: '#FFFFFF' }}>
      {HAS_MAP ? (
        <View style={{ height: 220, backgroundColor: SK.tealSoft }}>
          {pts ? (
            <Maps.default
              ref={mapRef}
              provider={Maps.PROVIDER_GOOGLE}
              style={{ flex: 1 }}
              initialRegion={coords[0] ? { ...coords[0], latitudeDelta: 0.05, longitudeDelta: 0.05 } : { latitude: 20.5937, longitude: 78.9629, latitudeDelta: 20, longitudeDelta: 20 }}
              toolbarEnabled={false}
            >
              {pts.shop ? <Maps.Marker coordinate={pts.shop} title={o.shopName || 'Shop'} description="Pickup" pinColor="#035C6C" /> : null}
              {pts.customer ? <Maps.Marker coordinate={pts.customer} title={o.customerName || 'Customer'} description="Delivery" pinColor="#F32C26" /> : null}
            </Maps.default>
          ) : <ActivityIndicator color={SK.teal} style={{ marginTop: 90 }} />}
        </View>
      ) : null}
      <View style={{ padding: 14, borderTopLeftRadius: 18, borderTopRightRadius: 18, marginTop: HAS_MAP ? -14 : 0, backgroundColor: '#FFFFFF' }}>
        <Text style={{ fontSize: 11, fontWeight: '800', color: SK.teal, letterSpacing: 0.6 }}>DELIVERY TASK</Text>
        <Text style={{ fontSize: 16, fontWeight: '800', color: SK.ink }}>Pickup from Shop</Text>
        {row(Store, 'Pickup Location', o.shopName, o.shopAddress)}
        {row(MapPin, 'Delivery Location', o.customerName, o.deliveryAddress)}
        {pts && !pts.shop && !pts.customer ? <Text style={{ fontSize: 11, color: MUTED, marginTop: 6 }}>Map location unavailable for these addresses.</Text> : null}
        <View style={{ flexDirection: 'row', gap: 8, marginTop: 12 }}>
          {o.shopPhone ? <Button title="Call Shop" Icon={Phone} variant="outline" style={{ flex: 1 }} onPress={() => Linking.openURL(`tel:${o.shopPhone}`).catch(() => {})} /> : null}
          {o.customerPhone ? <Button title="Call Customer" Icon={Phone} variant="outline" style={{ flex: 1 }} onPress={() => Linking.openURL(`tel:${o.customerPhone}`).catch(() => {})} /> : null}
        </View>
        <View style={{ flexDirection: 'row', gap: 8, marginTop: 8 }}>
          {o.shopAddress ? <Button title="Navigate" Icon={MapPin} variant="outline" style={{ flex: 1 }} onPress={() => directions(null, o.shopAddress)} /> : null}
          {onStartJourney && !journeyStarted ? <Button title="Start Journey" Icon={Navigation} style={{ flex: 1 }} onPress={onStartJourney} /> : null}
        </View>
      </View>
    </View>
  );
}
