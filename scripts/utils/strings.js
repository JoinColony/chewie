function splitStringByNewLine(str, maxLength) {
    const lines = str.split('\n');
    let result = [];
    let currentString = '';
    lines.forEach((line) => {
      if (currentString.length + line.length + 1 <= maxLength) {
        // Add the line to the current string
        currentString += line + '\n';
      } else {
        // Add the current string to the result array and start a new string
        result.push(currentString);
        currentString = line + '\n';
      }
    });
    // Add the final string to the result array
    result.push(currentString);
    return result;
  }

module.exports = {
    splitStringByNewLine
}