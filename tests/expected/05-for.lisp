(setq total 0)

(defun main ()
  (loop for i from 1 to 10 do
    (incf total i))
  (format t "Sum of 1 to 10: ~d~%" total))

(main)
