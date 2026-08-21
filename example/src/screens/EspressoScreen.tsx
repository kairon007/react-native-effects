import { Pressable, StatusBar, StyleSheet } from 'react-native';
import EspressoCup from '../components/EspressoCup';
import { useEspressoPhysics } from '../hooks/useEspressoPhysics';

/**
 * The phone IS an authentic cup of Italian espresso. Tilt it and the dense
 * coffee and velvety crema stay level with the world; tilt far enough to sip
 * and drain the cup; tap anywhere to pull a fresh double espresso shot with
 * steaming extraction and rich tigrato marbling.
 */
export default function EspressoScreen() {
  const { paramsSynchronizable, pullShot } = useEspressoPhysics();

  return (
    <Pressable style={styles.container} onPress={pullShot}>
      <StatusBar barStyle="light-content" backgroundColor="#000" translucent />
      <EspressoCup
        paramsSynchronizable={paramsSynchronizable}
        style={StyleSheet.absoluteFill}
      />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
  },
});
