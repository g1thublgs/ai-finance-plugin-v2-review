import datetime
import pathlib
import sys
sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent))
from meeting_common import date_range, make_pass, make_skip, make_warning, summary, build_evidence

RULE_META = {'id': 'rule_10', 'name': '会议时间是否为节假日或周末', 'category': '会议时间', 'level': 'warning'}
HOLIDAYS = {
    datetime.date(2026, 1, 1),
    datetime.date(2026, 2, 16), datetime.date(2026, 2, 17), datetime.date(2026, 2, 18), datetime.date(2026, 2, 19), datetime.date(2026, 2, 20), datetime.date(2026, 2, 21), datetime.date(2026, 2, 22),
    datetime.date(2026, 4, 4), datetime.date(2026, 4, 5), datetime.date(2026, 4, 6),
    datetime.date(2026, 5, 1), datetime.date(2026, 5, 2), datetime.date(2026, 5, 3), datetime.date(2026, 5, 4), datetime.date(2026, 5, 5),
    datetime.date(2026, 6, 19), datetime.date(2026, 6, 20), datetime.date(2026, 6, 21),
    datetime.date(2026, 9, 25), datetime.date(2026, 9, 26), datetime.date(2026, 9, 27),
    datetime.date(2026, 10, 1), datetime.date(2026, 10, 2), datetime.date(2026, 10, 3), datetime.date(2026, 10, 4), datetime.date(2026, 10, 5), datetime.date(2026, 10, 6), datetime.date(2026, 10, 7),
}

def evaluate(context):
    s = summary(context)
    days = date_range(s.get('startDate'), s.get('endDate'))
    if not days:
        return make_skip('rule_10', RULE_META['name'], '会议开始日期和结束日期字段', build_evidence(meetingDate=s.get('meetingDate')))
    hits = [d.isoformat() for d in days if d.weekday() >= 5 or d in HOLIDAYS]
    if hits:
        return make_warning('rule_10', RULE_META['name'], f'会议时间包含周末或法定节假日：{"、".join(hits)}。', '请核对会议安排是否确需在周末或节假日召开，并补充审批说明。', build_evidence(dates=hits))
    return make_pass('rule_10', RULE_META['name'], '会议时间未命中周末或已维护法定节假日。')
