import importlib
import pathlib
import sys
import unittest


HERE = pathlib.Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))


def load_rule(n):
    return importlib.import_module(f'rule_{n:02d}')


def ctx(summary=None, ocr_items=None, evidence=None):
    return {
        'summary': summary or {},
        'ocrItems': ocr_items or [],
        'evidence': evidence or {},
    }


def invoice(text='', amount='0'):
    return {'recognizeType': 'normalInvoice', 'rawText': text, 'totalAmount': amount, 'itemsDetail': [{'name': text, 'amount': amount}]}


def settlement(text='', **fields):
    return {'recognizeType': 'meetingSettlement', 'rawText': text, 'itemsDetail': [{'name': text, 'amount': fields.get('amount', '')}], **fields}


class MeetingRuleAccuracyTests(unittest.TestCase):
    def test_rule_01_location_only(self):
        rule = load_rule(1)
        self.assertTrue(rule.evaluate(ctx({'meetingLocation': '汕尾市区会议中心'}))['passed'])
        self.assertFalse(rule.evaluate(ctx({'meetingLocation': '黄山会议中心'}))['passed'])
        self.assertFalse(rule.evaluate(ctx({}, [{'recognizeType': 'meetingNotice', 'rawText': '政策说明提到黄山'}]))['passed'])

    def test_rule_02_payment_proof_and_org_payee(self):
        rule = load_rule(2)
        self.assertTrue(rule.evaluate({'summary': {'payments': [{'payeeName': '模拟会务有限公司'}]}})['passed'])
        self.assertFalse(rule.evaluate(ctx({'payments': [{'payeeName': '张三'}]}))['passed'])
        self.assertFalse(rule.evaluate(ctx({}, [{'recognizeType': 'paymentProof', 'payeeName': '李四'}]))['passed'])

    def test_rule_03_keywords_with_context(self):
        rule = load_rule(3)
        self.assertTrue(rule.evaluate(ctx({}, [invoice('会议资料印刷')]))['passed'])
        result = rule.evaluate(ctx({}, [settlement('会议导游服务费100元')]))
        self.assertFalse(result['passed'])
        self.assertIn('context', result['issues'][0]['evidence']['hits'][0])
        self.assertTrue(rule.evaluate(ctx({}, [settlement('会议背景材料印刷')]))['passed'])

    def test_rule_04_required_attachments(self):
        rule = load_rule(4)
        items = [{'recognizeType': t} for t in ['meetingPlan', 'meetingNotice', 'attendanceList', 'meetingSettlement']]
        self.assertTrue(rule.evaluate(ctx({}, items))['passed'])
        self.assertFalse(rule.evaluate(ctx({}, items[:2]))['passed'])
        self.assertFalse(rule.evaluate(ctx())['passed'])

    def test_rule_05_category_confidence(self):
        rule = load_rule(5)
        self.assertTrue(rule.evaluate(ctx({'meetingCategory': '二类会议'}))['passed'])
        low = rule.evaluate(ctx({'meetingName': '模拟工作会议', 'pageFields': {'reimbursementUnitName': '模拟单位'}}))
        self.assertFalse(low['passed'])
        self.assertFalse(rule.evaluate(ctx())['passed'])

    def test_rule_06_days_unknown_category_skips(self):
        rule = load_rule(6)
        self.assertFalse(rule.evaluate(ctx({'meetingCategory': '普通会议', 'meetingDays': 4}, evidence={'meetingDays': [1]}))['passed'])
        self.assertFalse(rule.evaluate(ctx({'meetingCategory': '四类会议', 'meetingDays': 3}, evidence={'meetingDays': [1], 'meetingCategory': [1]}))['passed'])
        self.assertTrue(rule.evaluate(ctx({'meetingCategory': '三类会议', 'meetingDays': 3}, evidence={'meetingDays': [1], 'meetingCategory': [1]}))['passed'])

    def test_rule_07_equal_threshold_triggers(self):
        rule = load_rule(7)
        base = {'meetingCategory': '四类会议'}
        attendance = {'recognizeType': 'attendanceList', 'names': [{'name': f'测试{i}'} for i in range(50)]}
        self.assertFalse(rule.evaluate(ctx(base, [attendance], {'meetingCategory': [1]}))['passed'])
        attendance['names'] = [{'name': f'测试{i}'} for i in range(49)]
        self.assertTrue(rule.evaluate(ctx(base, [attendance], {'meetingCategory': [1]}))['passed'])
        self.assertFalse(rule.evaluate(ctx({'meetingCategory': '普通会议', 'attendeeCount': 50}, evidence={'attendeeCount': [1]}))['passed'])

    def test_rule_08_quota_unknown_category_skips(self):
        rule = load_rule(8)
        self.assertFalse(rule.evaluate(ctx({'meetingCategory': '普通会议', 'meetingDays': 1}, [invoice('会议费', '99999')], {'meetingDays': [1]}))['passed'])
        summary = {'meetingCategory': '四类会议', 'meetingDays': 1}
        attendance = {'recognizeType': 'attendanceList', 'names': [{'name': f'测试{i}'} for i in range(10)]}
        self.assertFalse(rule.evaluate(ctx(summary, [attendance, invoice('会议费', '6000')], {'meetingCategory': [1], 'meetingDays': [1]}))['passed'])
        self.assertTrue(rule.evaluate(ctx(summary, [attendance, invoice('会议费', '5500')], {'meetingCategory': [1], 'meetingDays': [1]}))['passed'])

    def test_rule_09_item_standard_and_missing_amounts(self):
        rule = load_rule(9)
        summary = {'meetingCategory': '三类会议', 'meetingDays': 1, 'attendeeCount': 10, 'mealAmount': 1300, 'accommodationAmount': 3400}
        evidence = {'meetingCategory': [1], 'meetingDays': [1], 'attendeeCount': [1], 'mealAmount': [1], 'accommodationAmount': [1]}
        self.assertTrue(rule.evaluate(ctx(summary, evidence=evidence))['passed'])
        summary['mealAmount'] = 1301
        self.assertFalse(rule.evaluate(ctx(summary, evidence=evidence))['passed'])
        self.assertFalse(rule.evaluate(ctx({'meetingCategory': '四类会议', 'meetingDays': 1, 'attendeeCount': 10}, evidence=evidence))['passed'])

    def test_rule_10_weekend_holiday_and_missing(self):
        rule = load_rule(10)
        self.assertTrue(rule.evaluate(ctx({'startDate': '2026-04-28', 'endDate': '2026-04-30'}))['passed'])
        self.assertFalse(rule.evaluate(ctx({'meetingDate': '2026年4月28日至5月1日'}))['passed'])
        self.assertFalse(rule.evaluate(ctx())['passed'])

    def test_rule_11_suite_context(self):
        rule = load_rule(11)
        self.assertTrue(rule.evaluate(ctx({}, [{'recognizeType': 'accommodationList', 'rawText': '标准间'}]))['passed'])
        self.assertFalse(rule.evaluate(ctx({}, [{'recognizeType': 'accommodationList', 'rawText': '套房一间'}]))['passed'])
        self.assertFalse(rule.evaluate(ctx())['passed'])

    def test_rule_12_sensitive_food_dedup(self):
        rule = load_rule(12)
        self.assertTrue(rule.evaluate(ctx({}, [settlement('普通工作餐')]))['passed'])
        result = rule.evaluate(ctx({}, [settlement('茅台 茅台 鱼翅')]))
        self.assertFalse(result['passed'])
        self.assertEqual(sorted({hit['keyword'] for hit in result['issues'][0]['evidence']['hits']}), ['茅台', '鱼翅'])
        self.assertFalse(rule.evaluate(ctx())['passed'])

    def test_rule_13_blank_vs_zero(self):
        rule = load_rule(13)
        self.assertTrue(rule.evaluate(ctx({'accommodationAmount': 100, 'venueRentAmount': 500}, evidence={'accommodationAmount': [1], 'venueRentAmount': [1]}))['passed'])
        self.assertFalse(rule.evaluate(ctx({'accommodationAmount': 0, 'venueRentAmount': 500}, evidence={'accommodationAmount': [1], 'venueRentAmount': [1]}))['passed'])
        self.assertFalse(rule.evaluate(ctx({'accommodationAmount': 0, 'venueRentAmount': 500}, evidence={'venueRentAmount': [1]}))['passed'])

    def test_rule_14_equipment_keywords(self):
        rule = load_rule(14)
        self.assertTrue(rule.evaluate(ctx({}, [settlement('资料费')]))['passed'])
        self.assertFalse(rule.evaluate(ctx({}, [settlement('设备租赁费')]))['passed'])
        self.assertFalse(rule.evaluate(ctx())['passed'])


if __name__ == '__main__':
    unittest.main()
