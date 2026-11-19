import React, { useEffect, useState } from 'react';
import { ScrollView, TouchableOpacity, View } from 'react-native';
import { Text } from '../../components/Typography';
import { getScreeningQuestions } from '../../api/master';
import { rf } from '../../utils/responsive';
import { SK, SellCard, SellCta, SellLoader, SellPage, PrefillNote } from './sellKit';

// Same questions as the customer app's sell flow (master screening questions
// for the device category and working / dead flow), pre-answered from the
// customer's order (params.editHints, SellPickupController …/evaluation).
const FALLBACK = {
  WORKING: [
    { id: 'w1', question: 'Is the phone working properly?', helperText: 'Check the phone powers on.' },
    { id: 'w2', question: 'Is the touchscreen working properly?', helperText: 'Check touch functionality.' },
    { id: 'w3', question: "Is the phone's display original?", helperText: 'Choose Yes if never changed.' },
  ],
  DEAD: [
    { id: 'd1', question: 'What is the current condition of the phone?', options: ['Phone Dead (Not powering on)', 'Unknown Condition (Not sure / partially working)'] },
    { id: 'd2', question: "Is the phone's display original?", helperText: 'Choose Yes if never changed.' },
  ],
};

export default function SellInspectScreeningScreen({ navigation, route }) {
  const params = route.params || {};
  const flow = params.workingCondition === 'DEAD' ? 'DEAD' : 'WORKING';
  const prior = params.editHints?.screeningAnswers || [];
  const [questions, setQuestions] = useState([]);
  const [answers, setAnswers] = useState({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    (async () => {
      const list = await getScreeningQuestions(flow, params.device?.categoryId).catch(() => []);
      const qs = list.length ? list : FALLBACK[flow];
      // The customer's answer per question: by id, else by the question text.
      const seed = {};
      qs.forEach((q) => {
        const hit = prior.find((a) => a?.questionId && a.questionId === q.id)
          || prior.find((a) => a?.question && q.question && a.question.trim().toLowerCase() === q.question.trim().toLowerCase());
        if (hit?.answer) seed[q.id] = hit.answer;
      });
      if (!alive) return;
      setQuestions(qs);
      setAnswers(seed);
      setLoading(false);
    })();
    return () => { alive = false; };
  }, [flow]);

  const done = questions.length > 0 && questions.every((q) => answers[q.id]);
  const next = () => navigation.navigate('SellInspectScreen', {
    ...params,
    screeningAnswers: questions.filter((q) => answers[q.id]).map((q) => ({ questionId: q.id, question: q.question, answer: answers[q.id] })),
  });

  return (
    <SellPage title="Screening Question" subtitle="A few quick questions" navigation={navigation} footer={<SellCta onPress={next} disabled={!done} />}>
      {loading ? <SellLoader /> : (
        <ScrollView contentContainerStyle={{ padding: 14, paddingBottom: 24 }}>
          {prior.length ? <PrefillNote /> : null}
          {questions.map((q, i) => {
            const opts = Array.isArray(q.options) && q.options.length ? q.options : ['Yes', 'No'];
            const inline = opts.length <= 3 && opts.every((o) => String(o).length <= 14);
            return (
              <SellCard key={q.id}>
                <Text style={{ fontSize: rf(15), fontWeight: '800', color: SK.ink }}>{i + 1}. {q.question}</Text>
                {q.helperText ? <Text style={{ fontSize: rf(12), color: SK.muted, marginTop: 3 }}>{q.helperText}</Text> : null}
                <View style={{ flexDirection: inline ? 'row' : 'column', gap: 8, marginTop: 10 }}>
                  {opts.map((opt) => {
                    const on = answers[q.id] === opt;
                    return (
                      <TouchableOpacity
                        key={opt}
                        onPress={() => setAnswers((a) => ({ ...a, [q.id]: opt }))}
                        activeOpacity={0.85}
                        accessibilityRole="radio"
                        accessibilityState={{ checked: on }}
                        style={{
                          flex: inline ? 1 : undefined, minHeight: 46, borderRadius: 12, paddingHorizontal: 12,
                          alignItems: 'center', justifyContent: 'center',
                          backgroundColor: on ? SK.tealSoft : SK.tile, borderWidth: 1.5, borderColor: on ? SK.teal : SK.tile,
                        }}
                      >
                        <Text style={{ fontSize: rf(14), fontWeight: on ? '800' : '500', color: on ? SK.teal : SK.ink, textAlign: 'center' }}>{opt}</Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </SellCard>
            );
          })}
        </ScrollView>
      )}
    </SellPage>
  );
}
