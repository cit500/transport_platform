export const PASSABILITY = [
    {key:'PASS',label:'可通行'}, {key:'CONDITIONAL',label:'条件通行'},
    {key:'BLOCKED',label:'禁止通行'}, {key:'PENDING_DATA',label:'待核查'}
];
export const statusLabel = status => PASSABILITY.find(item => item.key === status)?.label || '待核查';
export const vehicleFields = [
    ['grossWeightTon','总车重','t'],['vehicleLengthM','长度','m'],['vehicleWidthM','宽度','m'],
    ['vehicleHeightM','高度','m'],['axleCount','轴数','轴'],['plannedSpeedKmh','计划速度','km/h']
];
export const assetFieldLabels = {
    bridge_type:'桥梁类型',tunnel_type:'隧道类型',total_length_m:'全长（m）',deck_width_m:'桥面宽度（m）',
    span_count:'跨数',max_span_m:'最大跨径（m）',pier_count:'桥墩数量',representative_pier_height_m:'代表墩高（m）',
    pier_section_type:'桥墩截面类型',pier_section_width_m:'桥墩截面宽（m）',pier_section_height_m:'桥墩截面高（m）',
    concrete_strength_mpa:'混凝土强度（MPa）',steel_strength_mpa:'钢材强度（MPa）',reinforcement_ratio:'配筋率',
    bearing_type:'支座类型',bearing_count:'支座数量',bearing_stiffness_kn_m:'支座刚度（kN/m）',has_restrainer:'防落梁装置',
    design_load_grade:'设计荷载等级',design_load_ton:'设计荷载（t）',vertical_clearance_m:'垂直净空（m）',
    horizontal_clearance_m:'水平净空（m）',diameter_m:'洞径（m）',buried_depth_m:'埋深（m）',section_type:'断面类型',
    lining_thickness_cm:'衬砌厚度（cm）',elastic_modulus_gpa:'弹性模量（GPa）',surrounding_rock_grade:'围岩等级',
    groundwater_level:'地下水等级',site_category:'场地类别',lane_count:'车道数'
};
export function vehicleSnapshot(vehicle) {
    return Object.fromEntries([['profileName',vehicle.profileName],...vehicleFields.map(([key]) => [key,Number(vehicle[key])])]);
}
