module.exports = brainPrefix => {
  const getMap = (key, brain) =>
    JSON.parse(brain.get(`${brainPrefix}-${key}`)) || {};

  const setMap = (key, value, brain) =>
    brain.set(`${brainPrefix}-${key}`, JSON.stringify(value));

  const removeMap = (key, brain) =>
    brain.remove(`${brainPrefix}-${key}`);

  const addToMap = (mapKey, key, value, brain) => {
    const map = getMap(mapKey, brain);
    // Use incremental number if no key is given
    key = key || Object.keys(map).length + 1;
    if (map[key]) {
      return false;
    }
    map[key] = value;
    setMap(mapKey, map, brain);
    return true
  };

  const updateMap = (mapKey, key, value, brain) => {
    const map = getMap(mapKey, brain);
    if (!key || !map[key]) {
      return false;
    }
    map[key] = value;
    setMap(mapKey, map, brain);
    return true;
  };

  const getFromMap = (mapKey, key, brain) => {
    const map = getMap(mapKey, brain);
    return map[key];
  };

  const removeFromMap = (mapKey, key, brain) => {
    const map = getMap(mapKey, brain);
    delete map[key];
    setMap(mapKey, map, brain);
  };

  return {
    addToMap,
    getFromMap,
    getMap,
    removeFromMap,
    removeMap,
    setMap,
    updateMap,
  };
}

