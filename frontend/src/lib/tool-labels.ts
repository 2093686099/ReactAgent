const TOOL_LABELS: Record<string, string> = {
  book_hotel: "预订酒店",
  execute: "执行命令",
  write_file: "写入文件",
  edit_file: "修改文件",
  maps_geo: "解析地址",
  maps_regeocode: "反向解析坐标",
  maps_text_search: "搜索地点",
  maps_around_search: "周边搜索",
  maps_search_detail: "查询地点详情",
  maps_weather: "查询天气",
  maps_direction_walking: "规划步行路线",
  maps_direction_driving: "规划驾车路线",
  maps_direction_transit_integrated: "规划公交路线",
  maps_direction_bicycling: "规划骑行路线",
  maps_distance: "计算两点距离",
  maps_ip_location: "定位 IP 位置",
};

export function getToolLabel(toolName: string): string {
  return TOOL_LABELS[toolName] ?? toolName;
}
