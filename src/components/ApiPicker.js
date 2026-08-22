import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Modal, FlatList, ActivityIndicator } from 'react-native';
import { rf } from '../utils/responsive';

export function ApiPicker({ label, items = [], loading, error, value, onSelect, placeholder = 'Select...', keyExtractor = (item) => item?.id, labelExtractor = (item) => item?.name ?? item?.label ?? String(item?.id) }) {
  const [open, setOpen] = useState(false);
  // Default `items` to [] and guard the lookup: rendering with a selected value
  // while options are still loading/failed (items === undefined) would throw
  // "Cannot read property 'find' of undefined".
  const selected = value != null ? (items || []).find((i) => keyExtractor(i) === value) : null;

  return (
    <View style={styles.wrap}>
      {label ? <Text style={styles.label}>{label}</Text> : null}
      <TouchableOpacity style={styles.trigger} onPress={() => setOpen(true)} disabled={loading}>
        {loading ? (
          <ActivityIndicator size="small" />
        ) : (
          <Text style={[styles.triggerText, !selected && styles.placeholder]}>
            {selected ? labelExtractor(selected) : placeholder}
          </Text>
        )}
      </TouchableOpacity>
      {error ? <Text style={styles.error}>{error}</Text> : null}
      <Modal visible={open} transparent animationType="slide">
        <TouchableOpacity style={styles.overlay} activeOpacity={1} onPress={() => setOpen(false)}>
          <View style={styles.modal}>
            <FlatList
              data={items}
              keyExtractor={(item) => String(keyExtractor(item))}
              renderItem={({ item }) => (
                <TouchableOpacity
                  style={styles.option}
                  onPress={() => {
                    onSelect(keyExtractor(item));
                    setOpen(false);
                  }}
                >
                  <Text style={styles.optionText}>{labelExtractor(item)}</Text>
                </TouchableOpacity>
              )}
            />
          </View>
        </TouchableOpacity>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { marginBottom: 12 },
  label: { fontSize: rf(14), marginBottom: 4, color: '#9AA0A6' },
  trigger: { borderWidth: 1, borderColor: '#3C4043', borderRadius: 8, padding: 12, minHeight: 48, justifyContent: 'center' },
  triggerText: { fontSize: rf(16), color: '#F8FAFC' },
  placeholder: { color: '#80868B' },
  error: { fontSize: rf(12), color: '#DC2626', marginTop: 4 },
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  modal: { backgroundColor: '#282A2D', borderTopLeftRadius: 16, borderTopRightRadius: 16, maxHeight: 400 },
  option: { padding: 16, borderBottomWidth: 1, borderBottomColor: '#3C4043' },
  optionText: { fontSize: rf(16), color: '#F8FAFC' },
});
