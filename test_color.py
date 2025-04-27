import billing_manager
import os
import traceback

def main():
    try:
        print("开始测试颜色设置...")
        # 创建BillingManager实例
        bm = billing_manager.BillingManager()
        
        # 保存带颜色的Excel文件
        output_file = 'test_color.xlsx'
        current_dir = os.getcwd()
        abs_output_path = os.path.abspath(output_file)
        
        print(f"当前工作目录: {current_dir}")
        print(f"输出文件将保存到: {abs_output_path}")
        
        result = bm.save_to_excel(output_file)
        
        if result:
            print(f"文件已成功保存到: {abs_output_path}")
            if os.path.exists(abs_output_path):
                print(f"文件确实存在，大小: {os.path.getsize(abs_output_path)} 字节")
            else:
                print(f"警告: 文件报告已保存，但在 {abs_output_path} 找不到文件")
        else:
            print("保存失败")
    except Exception as e:
        print(f"发生错误: {str(e)}")
        traceback.print_exc()

if __name__ == "__main__":
    main() 