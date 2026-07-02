import pathlib
import sys
sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent))
from meeting_common import make_fail, make_pass, make_skip, get_text_with_source, find_keywords, build_evidence

RULE_META = {'id': 'rule_01', 'name': '会议地点是否位于明令禁止风景名胜区', 'category': '会议地点', 'level': 'warning'}

FORBIDDEN = ['八达岭', '十三陵', '承德避暑山庄', '外八庙', '五台山', '太湖', '普陀山', '黄山', '九华山', '武夷山', '庐山', '泰山', '嵩山', '武当山', '武陵源', '张家界', '白云山', '桂林漓江', '三亚热带海滨', '峨眉山', '乐山大佛', '九寨沟', '黄龙', '黄果树', '西双版纳', '华山']

def evaluate(context):
    location_info = get_text_with_source(context, [
        'summary.meetingLocation',
        'summary.pageFields.meetingLocation',
    ])
    location = location_info.get('value') or ''
    if not location:
        return make_skip('rule_01', RULE_META['name'], '会议地点字段', build_evidence(field='meetingLocation'))
    hits = find_keywords(location, FORBIDDEN)
    if hits:
        return make_fail('rule_01', RULE_META['name'], f'会议地点疑似位于禁止召开会议的风景名胜区：{location}', '请核对会议通知地点，必要时补充说明或调整会议地点。', build_evidence(location=location, source=location_info.get('source'), hits=hits))
    return make_pass('rule_01', RULE_META['name'], '会议地点未命中禁止风景名胜区关键词。')
