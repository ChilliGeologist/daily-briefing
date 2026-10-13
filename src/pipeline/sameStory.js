'use strict';

function makeJudge(ollama, settings, log) {
  return async (a, b) => {
    const prompt = `Two news items are below. Answer YES if they report the same news event (the same incident, announcement or decision), even if they are worded differently or one has more detail. Answer NO if they are different events, even on the same topic. Reply with one word: YES or NO.

Item 1: ${a.title}
${(a.description || '').slice(0, 300)}

Item 2: ${b.title}
${(b.description || '').slice(0, 300)}`;
    const result = await ollama.generate(
      settings.getOllamaUrl(),
      settings.getOllamaModel(),
      prompt,
      { temperature: 0, num_predict: 5 }
    );
    const answer = result.response.trim();
    const isSame = /^YES/i.test(answer);
    if (log && log.debug) {
      log.debug('pipeline:cluster', `Same-story judge: ${isSame ? 'YES' : 'NO'}`, {
        titles: [a.title, b.title],
        response: answer,
      });
    }
    return isSame;
  };
}

module.exports = { makeJudge };
