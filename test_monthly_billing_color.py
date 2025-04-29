import billing_manager
import os
import traceback

def main():
    try:
        print("开始测试月账单统计颜色设置...")
        # 创建BillingManager实例
        bm = billing_manager.BillingManager()
        
        # 保存带颜色的Excel文件
        output_file = 'test_monthly_billing_color.xlsx'
        current_dir = os.getcwd()
        abs_output_path = os.path.abspath(output_file)
        
        print(f"当前工作目录: {current_dir}")
        print(f"输出文件将保存到: {abs_output_path}")
        
        # 导出指定年月的账单
        # 测试单月导出
        specific_year = 2025
        specific_month = 4
        result = bm.save_monthly_billing_to_excel(output_file, specific_year=specific_year, specific_month=specific_month, add_nat_stats=True)
        
        if result:
            print(f"月账单统计文件已成功保存到: {abs_output_path}")
            if os.path.exists(abs_output_path):
                print(f"文件确实存在，大小: {os.path.getsize(abs_output_path)} 字节")
                print("NAT统计表格已添加到Excel文件中")
            else:
                print(f"警告: 文件报告已保存，但在 {abs_output_path} 找不到文件")
        else:
            print("保存失败")
    except Exception as e:
        print(f"发生错误: {str(e)}")
        traceback.print_exc()

if __name__ == "__main__":
    main() 